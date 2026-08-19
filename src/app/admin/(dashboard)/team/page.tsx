import { TeamManager } from '@/components/admin/team-manager';
import { requireSession } from '@/server/auth/guard';
import { listStaff, listStaffScores } from '@/server/repositories/staff';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const session = await requireSession();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Team</h1>
        <p className="type-body mt-1 text-ink-muted text-pretty">
          Customers pick a name, then rate them. Only you ever see the scores.
        </p>
      </div>

      <TeamManager
        staff={listStaff(true)}
        scores={listStaffScores()}
        csrfToken={session.csrfToken}
      />
    </div>
  );
}
