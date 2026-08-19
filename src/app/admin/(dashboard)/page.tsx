import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Stars } from '@/components/ui/stars';
import { EmptyState, Stat } from '@/components/ui/stat';
import { StaffAvatar } from '@/components/review/staff-picker';
import { requireSession } from '@/server/auth/guard';
import { getDashboardStats, listWishTally } from '@/server/repositories/feedback';
import { listStaffScores } from '@/server/repositories/staff';
import { formatAverage, formatPercent, formatRelativeCount } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const session = await requireSession();
  const stats = getDashboardStats();
  const staffScores = listStaffScores().filter((s) => s.ratingCount > 0);
  const wishes = listWishTally(8);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="type-display">Good to see you, {session.user.displayName.split(' ')[0]}</h1>
        <p className="type-body mt-1 text-ink-muted">
          {formatRelativeCount(stats.feedbackLast7Days, 'response')} in the last seven days.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Average visit"
          value={formatAverage(stats.averageStoreRating)}
          hint={`${stats.totalFeedback} total`}
          tone={
            stats.averageStoreRating === null
              ? 'neutral'
              : stats.averageStoreRating >= 4
                ? 'positive'
                : stats.averageStoreRating >= 3
                  ? 'caution'
                  : 'neutral'
          }
        />
        <Stat label="Average team" value={formatAverage(stats.averageStaffRating)} />
        <Stat label="Last 7 days" value={stats.feedbackLast7Days} />
        <Stat
          label="Tapped through"
          value={formatPercent(stats.googleClickThroughRate)}
          // Named precisely: this is the hand-off rate, not the review rate.
          // Google never tells us whether a review was actually written.
          hint="opened Google"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="How visits are rated" description="Every response, all time." />
          <CardBody className="pt-2">
            {stats.totalFeedback === 0 ? (
              <EmptyState
                title="Nothing yet"
                description="As soon as someone scans a tag their rating shows up here."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {[...stats.ratingHistogram].reverse().map((bucket) => {
                  const share = bucket.count / stats.totalFeedback;
                  return (
                    <li key={bucket.rating} className="flex items-center gap-3">
                      <Stars value={bucket.rating} className="w-[5.5rem] shrink-0" />
                      <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                        {/*
                          Width, not transform: the bar has to stay pinned to
                          the left edge, and it animates once on load only.
                        */}
                        <div
                          className="h-full rounded-pill bg-brand transition-[width] duration-sheet ease-out-strong"
                          style={{ width: `${Math.max(share * 100, bucket.count ? 2 : 0)}%` }}
                        />
                      </div>
                      <span className="type-caption w-8 shrink-0 text-right tabular-nums">
                        {bucket.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Most asked for"
            description="What customers wanted and could not find."
          />
          <CardBody className="pt-2">
            {wishes.length === 0 ? (
              <EmptyState
                title="No requests yet"
                description="Add a few quick-pick chips under Wishlist so customers can answer with one tap."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line/60">
                {wishes.map((wish) => (
                  <li key={wish.label} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <span className="type-body min-w-0 flex-1 truncate">{wish.label}</span>
                    {wish.isCustom ? <Badge tone="brand">typed in</Badge> : null}
                    <span className="type-caption w-8 shrink-0 text-right font-semibold tabular-nums text-ink">
                      {wish.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader title="Team" description="Average rating from customers who named them." />
          <CardBody className="pt-2">
            {staffScores.length === 0 ? (
              <EmptyState
                title="No team ratings yet"
                description="Add people under Team, then print a tag for each of them."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line/60">
                {staffScores.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 py-3 first:pt-0">
                    <StaffAvatar
                      initials={person.initials}
                      accent={person.accent}
                      className="h-9 w-9 shrink-0 text-[0.8125rem]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="type-body truncate font-medium">{person.name}</p>
                      <p className="type-caption">
                        {formatRelativeCount(person.ratingCount, 'rating')}
                      </p>
                    </div>
                    <span className="type-numeric font-semibold tabular-nums">
                      {formatAverage(person.averageRating)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <p className="type-caption">
        <Link href="/admin/feedback" className="font-semibold text-brand underline underline-offset-4">
          Read individual responses
        </Link>
      </p>
    </div>
  );
}
