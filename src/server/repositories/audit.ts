import 'server-only';

import { getDb } from '@/server/db/client';

export interface AuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
}

/**
 * Append-only. There is deliberately no update or delete: an audit trail an
 * administrator can rewrite is not an audit trail. `detail` holds a short human
 * summary, never the secret that changed.
 */
export function recordAudit(input: {
  actorId: number | null;
  actorEmail: string | null;
  action: string;
  target?: string | null;
  detail?: string | null;
  ipHash?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor_id, actor_email, action, target, detail, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.actorId,
      input.actorEmail,
      input.action,
      input.target ?? null,
      input.detail ?? null,
      input.ipHash ?? null,
    );
}

export function listAudit(limit = 100): AuditEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, actor_email, action, target, detail, created_at
         FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 500)) as Array<{
    id: number;
    actor_email: string | null;
    action: string;
    target: string | null;
    detail: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    actorEmail: r.actor_email,
    action: r.action,
    target: r.target,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}
