import 'server-only';

import { headers } from 'next/headers';

import { env } from '@/lib/env';

/**
 * Best-effort client address.
 *
 * `X-Forwarded-For` is attacker-controlled unless a trusted proxy overwrites
 * it, so it is only consulted when the operator has explicitly opted in via
 * TRUST_PROXY_HEADERS. Getting this wrong turns every rate limit into a no-op,
 * because a client can simply rotate the header it sends.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();

  if (env.TRUST_PROXY_HEADERS) {
    // Left-most entry is the original client; the proxy appends itself on the right.
    const forwarded = h.get('x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first;
    const real = h.get('x-real-ip')?.trim();
    if (real) return real;
  }

  return h.get('x-vercel-forwarded-for')?.trim() ?? null;
}

export async function getUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent');
}

/**
 * Origin check — the primary CSRF defence.
 *
 * `Origin` is set by the browser on every state-changing request and cannot be
 * forged by page script. A request whose Origin is absent *and* whose Referer
 * is absent is rejected too: legitimate browser form posts always carry one.
 */
export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin === env.APP_ORIGIN;

  const referer = h.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === env.APP_ORIGIN;
    } catch {
      return false;
    }
  }

  return false;
}
