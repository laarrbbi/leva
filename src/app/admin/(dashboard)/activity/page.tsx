import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/stat';
import { formatWhen } from '@/lib/format';
import { requireSession } from '@/server/auth/guard';
import { listAudit } from '@/server/repositories/audit';

export const dynamic = 'force-dynamic';

/** Human wording for each audit action. Unknown actions fall back to the raw key. */
const ACTION_LABELS: Record<string, string> = {
  'login.success': 'Signed in',
  'login.failed': 'Failed sign-in attempt',
  'login.blocked_locked': 'Sign-in blocked — account locked',
  logout: 'Signed out',
  'password.changed': 'Password changed',
  'settings.updated': 'Store settings updated',
  'staff.created': 'Team member added',
  'staff.updated': 'Team member updated',
  'staff.archived': 'Team member removed',
  'suggestion.created': 'Wishlist chip added',
  'suggestion.updated': 'Wishlist chip updated',
  'suggestion.deleted': 'Wishlist chip deleted',
};

const ALARMING = new Set(['login.failed', 'login.blocked_locked']);

export default async function ActivityPage() {
  await requireSession();
  const entries = listAudit(150);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Activity</h1>
        <p className="type-body mt-1 max-w-prose text-ink-muted text-pretty">
          Every administrative change and every sign-in attempt. This log cannot be edited or
          deleted from inside the app — if something here surprises you, change your password.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" description="Actions appear here as they happen." />
      ) : (
        <Card>
          <CardBody className="py-2">
            <ul className="divide-y divide-line/60">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline gap-3 py-2.5">
                  <span
                    aria-hidden
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      ALARMING.has(entry.action) ? 'bg-critical' : 'bg-line-strong'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="type-body">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {entry.detail ? (
                        <span className="text-ink-muted"> — {entry.detail}</span>
                      ) : null}
                    </p>
                    <p className="type-caption">{entry.actorEmail ?? 'unknown account'}</p>
                  </div>
                  <span className="type-caption shrink-0 tabular-nums">
                    {formatWhen(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
