import Link from 'next/link';

import { StaffAvatar } from '@/components/review/staff-picker';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Stars } from '@/components/ui/stars';
import { EmptyState } from '@/components/ui/stat';
import { cn } from '@/lib/cn';
import { formatWhen } from '@/lib/format';
import { requireSession } from '@/server/auth/guard';
import { countFeedback, listFeedback } from '@/server/repositories/feedback';
import { listStaff } from '@/server/repositories/staff';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'praise', label: '4–5 stars' },
  { key: 'problems', label: '1–3 stars' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FeedbackPage({ searchParams }: PageProps) {
  await requireSession();
  const query = await searchParams;

  const rawFilter = typeof query.filter === 'string' ? query.filter : 'all';
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter)
    ? (rawFilter as FilterKey)
    : 'all';

  // Page numbers come from the URL, so clamp rather than trust.
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);

  const entries = listFeedback({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    ...(filter === 'praise' ? { minRating: 4 } : {}),
    ...(filter === 'problems' ? { maxRating: 3 } : {}),
  });

  const total = countFeedback();
  const staffById = new Map(listStaff(true).map((person) => [person.id, person]));
  const hasNextPage = entries.length === PAGE_SIZE;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Feedback</h1>
        <p className="type-body mt-1 text-ink-muted">
          {total} response{total === 1 ? '' : 's'}, newest first.
        </p>
      </div>

      <nav aria-label="Filter responses" className="flex gap-1.5">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={option.key === 'all' ? '/admin/feedback' : `/admin/feedback?filter=${option.key}`}
            aria-current={filter === option.key ? 'page' : undefined}
            className={cn(
              'pressable rounded-pill px-3.5 py-1.5 text-[0.8125rem] font-medium',
              'transition-colors duration-hover ease-out-strong',
              filter === option.key
                ? 'bg-brand text-white'
                : 'bg-surface text-ink-muted ring-1 ring-line hover:text-ink',
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          description="Either no one has scanned a tag yet, or nothing matches this filter."
        />
      ) : (
        <ul className="stagger flex flex-col gap-3">
          {entries.map((entry) => {
            const person = entry.staffId ? staffById.get(entry.staffId) : undefined;
            const name = entry.staffName ?? person?.name ?? null;

            return (
              <li key={entry.id}>
                <Card className="hoverable">
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <Stars value={entry.storeRating} size="md" />
                      <span className="type-caption">{formatWhen(entry.createdAt)}</span>
                      <div className="flex-1" />
                      <Badge tone="neutral">{entry.source.toUpperCase()}</Badge>
                      {entry.googleCtaClickedAt ? (
                        <Badge tone="positive">opened Google</Badge>
                      ) : null}
                    </div>

                    {name ? (
                      <div className="flex items-center gap-2.5">
                        <StaffAvatar
                          initials={person?.initials ?? name.slice(0, 2).toUpperCase()}
                          accent={person?.accent ?? 'indigo'}
                          className="h-7 w-7 shrink-0 text-[0.6875rem]"
                        />
                        <span className="type-caption font-medium text-ink">{name}</span>
                        {entry.staffRating ? <Stars value={entry.staffRating} /> : null}
                      </div>
                    ) : null}

                    {/*
                      Rendered as text, never as markup. React escapes this by
                      default and nothing here opts out of that.
                    */}
                    {entry.comment ? (
                      <p className="type-body whitespace-pre-wrap text-pretty">{entry.comment}</p>
                    ) : null}

                    {entry.wishes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {entry.wishes.map((wish, index) => (
                          <span
                            key={`${entry.id}-${index}`}
                            className="rounded-pill bg-surface-sunken px-2.5 py-1 text-[0.75rem] text-ink-muted"
                          >
                            {wish}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {(page > 1 || hasNextPage) && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/admin/feedback?filter=${filter}&page=${page - 1}`}
              className="type-caption font-semibold text-brand underline underline-offset-4"
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          {hasNextPage ? (
            <Link
              href={`/admin/feedback?filter=${filter}&page=${page + 1}`}
              className="type-caption font-semibold text-brand underline underline-offset-4"
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
