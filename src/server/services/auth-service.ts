import 'server-only';

import { TTL } from '@/lib/constants';
import { recordAudit } from '@/server/repositories/audit';
import {
  findUserByEmail,
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  updatePasswordHash,
} from '@/server/repositories/users';
import { hashPassword, needsRehash, verifyPassword } from '@/server/security/password';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { createSession } from '@/server/auth/session';

/** Account is locked for this long once the attempt budget is spent. */
const MAX_FAILED_ATTEMPTS = 8;

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_credentials' | 'rate_limited' | 'locked' };

/**
 * A scrypt verification against a throwaway hash.
 *
 * When the email does not exist there is no stored hash to check, so the
 * request would return in microseconds instead of the ~100 ms a real check
 * takes — handing an attacker a reliable account-enumeration oracle. Burning
 * the same work on the miss closes it.
 */
const DUMMY_HASH_PROMISE = hashPassword('this-hash-is-never-matched-by-any-password');

export async function login(input: {
  email: string;
  password: string;
  ip: string | null;
}): Promise<LoginResult> {
  const ipHash = hashIp(input.ip);

  // Per-IP budget stops one attacker spraying many accounts; the per-account
  // lockout below stops many attackers converging on one account.
  if (!consume(RULES.login, ipHash ?? ANONYMOUS_BUCKET).allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const user = findUserByEmail(input.email);

  if (!user) {
    await verifyPassword(input.password, await DUMMY_HASH_PROMISE);
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (!user.is_active) {
    await verifyPassword(input.password, await DUMMY_HASH_PROMISE);
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (isLocked(user)) {
    recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'login.blocked_locked',
      ipHash,
    });
    return { ok: false, reason: 'locked' };
  }

  const valid = await verifyPassword(input.password, user.password_hash);

  if (!valid) {
    recordFailedLogin(user.id, MAX_FAILED_ATTEMPTS, TTL.loginLockout);
    recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: 'login.failed',
      ipHash,
    });
    return { ok: false, reason: 'invalid_credentials' };
  }

  // Transparently upgrade hashes that were written with weaker parameters.
  if (needsRehash(user.password_hash)) {
    updatePasswordHash(user.id, await hashPassword(input.password));
  }

  recordSuccessfulLogin(user.id);
  // A brand-new session id on every login: never adopt an id the client already
  // had, which is what makes session fixation possible.
  await createSession(user.id);
  recordAudit({ actorId: user.id, actorEmail: user.email, action: 'login.success', ipHash });

  return { ok: true };
}
