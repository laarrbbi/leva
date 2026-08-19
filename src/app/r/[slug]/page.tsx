import { notFound } from 'next/navigation';

import { ReviewFlow } from '@/components/review/review-flow';
import { Card, CardBody } from '@/components/ui/card';
import { findSettingsBySlug } from '@/server/repositories/settings';
import { findStaffByCode, listStaff } from '@/server/repositories/staff';
import { listSuggestions } from '@/server/repositories/suggestions';
import { issueVisitToken } from '@/server/repositories/visit-tokens';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp } from '@/server/security/request';
import type { Source } from '@/types/domain';

/**
 * The kiosk page.
 *
 * Every render mints a single-use visit token, so it can never be cached or
 * statically generated — two customers sharing one token would mean one of them
 * silently loses their feedback.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function KioskPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const settings = findSettingsBySlug(slug);
  if (!settings) notFound();

  const ipHash = hashIp(await getClientIp());

  // Cap how fast tokens can be minted from one address. Without this the page
  // itself becomes the token faucet that feeds a scripted submission flood.
  if (!consume(RULES.visitToken, ipHash ?? ANONYMOUS_BUCKET).allowed) {
    return <RateLimited storeName={settings.storeName} />;
  }

  // `t` identifies a person-specific tag; `s` records how the tag was read.
  const staffCode = readParam(query, 't');
  const rawSource = readParam(query, 's');
  const source: Source = rawSource === 'nfc' ? 'nfc' : rawSource === 'link' ? 'link' : 'qr';

  const presetStaff = staffCode ? findStaffByCode(staffCode) : null;
  const activePresetStaff = presetStaff?.isActive ? presetStaff : null;

  const visitToken = issueVisitToken({
    staffId: activePresetStaff?.id ?? null,
    source,
    ipHash,
  });

  const staff = settings.askForStaffRating ? listStaff() : [];
  const suggestions = settings.askForWishes ? listSuggestions() : [];

  return (
    /*
      Vertically centred with a max width, so the flow reads as one object on a
      phone held in one hand rather than as three bands spread down the screen.
    */
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-5 py-8"
    >
      <header className="text-center">
        <p className="type-caption font-semibold uppercase tracking-[0.1em] text-ink-subtle">
          {settings.storeName}
        </p>
      </header>

      <Card>
        <CardBody className="px-5 py-7 sm:px-6">
          <ReviewFlow
            settings={settings}
            staff={staff}
            suggestions={suggestions}
            visitToken={visitToken}
            presetStaff={activePresetStaff}
            source={source}
          />
        </CardBody>
      </Card>

      <footer className="text-center">
        <p className="type-caption text-ink-subtle">
          Anonymous. We never ask for your name or email.
        </p>
      </footer>
    </main>
  );
}

function RateLimited({ storeName }: { storeName: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 text-center">
      <h1 className="type-title">One moment</h1>
      <p className="type-body mt-2 text-ink-muted">
        {storeName} has had a lot of feedback from this connection just now. Please try again in a
        few minutes.
      </p>
    </main>
  );
}
