'use server';

import { redirect } from 'next/navigation';

import { CSRF_FIELD, CsrfError, assertCsrf } from '@/server/auth/csrf';
import { createSession, destroySession, getSession, revokeAllSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/repositories/audit';
import { findUserById, updatePasswordHash } from '@/server/repositories/users';
import { hashPassword, verifyPassword } from '@/server/security/password';
import { hashIp } from '@/server/security/hash';
import { getClientIp, isSameOrigin } from '@/server/security/request';
import { login } from '@/server/services/auth-service';
import { changePasswordSchema, loginSchema } from '@/server/validation/schemas';

import { fail, ok, toFieldErrors, type ActionState } from './types';

/**
 * The login form is the one mutation with no session to bind a CSRF token to,
 * so it relies on the Origin check alone. That is sufficient here: a forged
 * login cannot read the response, and the worst outcome — logging the victim
 * into the attacker's own account — is prevented by the session being minted
 * fresh on every successful authentication.
 */
export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await isSameOrigin())) return fail('Request rejected.');

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  // One message for every failure mode. Distinguishing "no such account" from
  // "wrong password" hands an attacker a free list of valid emails.
  const GENERIC = 'That email and password combination did not work.';
  if (!parsed.success) return fail(GENERIC);

  const result = await login({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: await getClientIp(),
  });

  if (!result.ok) {
    if (result.reason === 'rate_limited') {
      return fail('Too many attempts. Please wait a few minutes and try again.');
    }
    if (result.reason === 'locked') {
      return fail('This account is temporarily locked. Try again in 15 minutes.');
    }
    return fail(GENERIC);
  }

  redirect('/admin');
}

export async function logoutAction(formData: FormData): Promise<void> {
  try {
    const session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
    recordAudit({
      actorId: session.user.id,
      actorEmail: session.user.email,
      action: 'logout',
      ipHash: hashIp(await getClientIp()),
    });
  } catch (error) {
    if (!(error instanceof CsrfError)) throw error;
    // Fall through: a failed CSRF check must still clear the cookies. Refusing
    // to log someone out is a worse outcome than honouring a forged logout.
  }

  await destroySession();
  redirect('/admin/login');
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let session;
  try {
    session = await assertCsrf(formData.get(CSRF_FIELD)?.toString());
  } catch {
    return fail('Your session expired. Please sign in again.');
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return fail('Please check the form.', toFieldErrors(parsed.error.issues));
  }

  const user = findUserById(session.user.id);
  if (!user) return fail('Your session expired. Please sign in again.');

  if (!(await verifyPassword(parsed.data.currentPassword, user.password_hash))) {
    return fail('Please check the form.', {
      currentPassword: 'That is not your current password',
    });
  }

  updatePasswordHash(user.id, await hashPassword(parsed.data.newPassword));

  // Every other device is signed out. If the password was changed because it
  // may have leaked, leaving old sessions alive would defeat the whole point.
  revokeAllSessions(user.id);

  recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'password.changed',
    detail: 'All other sessions revoked',
    ipHash: hashIp(await getClientIp()),
  });

  // Re-issue the current session so the admin is not signed out of the tab
  // they are looking at.
  await createSession(user.id);

  return ok('Password updated. Every other device has been signed out.');
}

/** Convenience for server components that need the session's CSRF token. */
export async function currentCsrfToken(): Promise<string> {
  return (await getSession())?.csrfToken ?? '';
}
