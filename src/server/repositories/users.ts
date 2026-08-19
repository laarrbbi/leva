import 'server-only';

import { getDb } from '@/server/db/client';
import type { Role } from '@/types/domain';

export interface AdminUserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  is_active: number;
  failed_attempts: number;
  locked_until: string | null;
}

export function findUserByEmail(email: string): AdminUserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, password_hash, display_name, role, is_active, failed_attempts, locked_until
         FROM admin_users WHERE email = ? COLLATE NOCASE`,
    )
    .get(email) as AdminUserRow | undefined;
  return row ?? null;
}

export function findUserById(id: number): AdminUserRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, password_hash, display_name, role, is_active, failed_attempts, locked_until
         FROM admin_users WHERE id = ?`,
    )
    .get(id) as AdminUserRow | undefined;
  return row ?? null;
}

export function createUser(input: {
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO admin_users (email, password_hash, display_name, role)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.email, input.passwordHash, input.displayName, input.role);
  return Number(info.lastInsertRowid);
}

/** Called on every failed password check; locks the account once the budget is spent. */
export function recordFailedLogin(userId: number, maxAttempts: number, lockSeconds: number): void {
  getDb()
    .prepare(
      `UPDATE admin_users
          SET failed_attempts = failed_attempts + 1,
              locked_until = CASE
                WHEN failed_attempts + 1 >= @maxAttempts
                THEN datetime('now', @lockWindow)
                ELSE locked_until
              END
        WHERE id = @userId`,
    )
    .run({ userId, maxAttempts, lockWindow: `+${lockSeconds} seconds` });
}

export function recordSuccessfulLogin(userId: number): void {
  getDb()
    .prepare(
      `UPDATE admin_users
          SET failed_attempts = 0,
              locked_until = NULL,
              last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`,
    )
    .run(userId);
}

export function updatePasswordHash(userId: number, passwordHash: string): void {
  getDb()
    .prepare(
      `UPDATE admin_users
          SET password_hash = ?,
              password_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`,
    )
    .run(passwordHash, userId);
}

export function isLocked(user: AdminUserRow): boolean {
  if (!user.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}
