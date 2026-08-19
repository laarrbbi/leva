import 'server-only';

import { safeEqual } from '@/server/security/hash';
import { isSameOrigin } from '@/server/security/request';

import { getSession, type ActiveSession } from './session';

export class CsrfError extends Error {
  constructor() {
    super('Request rejected: cross-site request forgery check failed.');
    this.name = 'CsrfError';
  }
}

/**
 * Two independent checks, both of which must pass.
 *
 *  1. Origin/Referer must equal APP_ORIGIN. Browsers set these and page script
 *     cannot override them, so this alone stops classic form-post CSRF.
 *  2. The submitted token must match the one bound to the session row. This is
 *     the belt to the Origin braces: it survives a permissive CORS config, a
 *     proxy that rewrites Origin, and non-browser clients.
 *
 * Defence in depth matters here because a forged request would let an attacker
 * silently rewrite the Google review URL, i.e. redirect every future customer.
 */
export async function assertCsrf(submittedToken: string | null | undefined): Promise<ActiveSession> {
  if (!(await isSameOrigin())) throw new CsrfError();

  const session = await getSession();
  if (!session) throw new CsrfError();

  if (!submittedToken) throw new CsrfError();
  if (!safeEqual(submittedToken, session.csrfToken)) throw new CsrfError();

  return session;
}

/** Field name used by every admin form; also accepted as the `x-csrf-token` header. */
export { CSRF_FIELD, CSRF_HEADER } from '@/lib/constants';
