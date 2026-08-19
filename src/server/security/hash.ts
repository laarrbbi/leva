import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

/** 256 bits of CSPRNG entropy, URL-safe. Used for every opaque token we mint. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Digest of a bearer-style token for storage.
 *
 * Plain SHA-256 is correct here (and PBKDF-style stretching would be wasteful):
 * the input already has 256 bits of entropy, so there is nothing to brute-force.
 * The point is only that a database dump must not yield replayable tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** Constant-time string comparison. Never compare secrets with `===`. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  // Hash both sides first so the comparison is always over 32 equal bytes.
  return timingSafeEqual(
    createHash('sha256').update(bufA).digest(),
    createHash('sha256').update(bufB).digest(),
  );
}

/**
 * Pseudonymised client address.
 *
 * A raw IP is personal data under GDPR and we have no product need for it. We
 * keep a keyed, truncated digest: enough to count "same device" for rate
 * limiting and abuse review, not enough to reverse (the keyspace of all IPv4
 * addresses is small enough to brute-force an *unkeyed* hash in seconds, hence
 * the HMAC pepper). Rotating IP_HASH_SECRET orphans every stored value.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', env.IP_HASH_SECRET).update(ip).digest('base64url').slice(0, 22);
}

/**
 * Coarse user-agent family. We deliberately discard the full UA string, which
 * is a strong fingerprinting vector, and keep only what is useful for support
 * ("the iOS customers are dropping off at step 2").
 */
export function userAgentFamily(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (s.includes('android')) return 'android';
  if (s.includes('iphone') || s.includes('ipad') || s.includes('ipod')) return 'ios';
  if (s.includes('windows')) return 'windows';
  if (s.includes('mac os')) return 'macos';
  if (s.includes('linux')) return 'linux';
  return 'other';
}
