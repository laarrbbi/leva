import Link from 'next/link';

import { logoutAction } from '@/server/actions/auth-actions';
import { requireSession } from '@/server/auth/guard';
import { getSettings } from '@/server/repositories/settings';
import { CSRF_FIELD } from '@/lib/constants';

/** Session state must never be cached or shared between requests. */
export const dynamic = 'force-dynamic';

/**
 * Nav labels name their contents rather than using generic umbrellas —
 * "Wishlist" tells you what is inside, "More" does not.
 */
const REVIEW_NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/suggestions', label: 'Wishlist' },
] as const;

/** Only rendered when the owner has switched the ordering module on. */
const ORDERING_NAV = [
  { href: '/admin/pedidos', label: 'Pedidos' },
  { href: '/admin/carta', label: 'Carta' },
  { href: '/admin/cierre', label: 'Cierre' },
] as const;

const TAIL_NAV = [
  { href: '/admin/tags', label: 'Tags' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/activity', label: 'Activity' },
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { pickupEnabled } = getSettings();

  const nav = [...REVIEW_NAV, ...(pickupEnabled ? ORDERING_NAV : []), ...TAIL_NAV];

  return (
    <div className="min-h-dvh bg-canvas">
      {/*
        Translucent chrome with content scrolling underneath, rather than an
        opaque bar that eats a fixed strip of a phone screen.
      */}
      <header className="chrome sticky top-0 z-40 border-b border-line/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/admin" className="type-heading shrink-0 tracking-tight">
            Leva
          </Link>

          <nav aria-label="Admin sections" className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex gap-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="pressable inline-flex whitespace-nowrap rounded-pill px-3 py-1.5 text-[0.8125rem] font-medium text-ink-muted transition-colors duration-hover ease-out-strong hover:bg-surface-sunken hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <form action={logoutAction} className="shrink-0">
            <input type="hidden" name={CSRF_FIELD} value={session.csrfToken} />
            <button
              type="submit"
              className="pressable rounded-pill px-3 py-1.5 text-[0.8125rem] font-medium text-ink-subtle transition-colors duration-hover ease-out-strong hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
