import 'server-only';

import { redirect } from 'next/navigation';

import { getSession, type ActiveSession } from './session';

/**
 * Gate for every admin route. Redirects rather than rendering an error so an
 * unauthenticated visitor never learns whether a given admin page exists.
 */
export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  return session;
}

/** Role gate. `owner` may manage administrators; `manager` may not. */
export async function requireOwner(): Promise<ActiveSession> {
  const session = await requireSession();
  if (session.user.role !== 'owner') redirect('/admin');
  return session;
}
