/** Presentation helpers. Pure, dependency-free, safe on both client and server. */

/** One decimal place, or an em dash when there is nothing to average. */
export function formatAverage(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

/** "1 rating" / "4 ratings" / "no ratings" — reads better than a bare count. */
export function formatRelativeCount(count: number, noun: string): string {
  if (count === 0) return `No ${noun}s`;
  if (count === 1) return `1 ${noun}`;
  return `${count} ${noun}s`;
}

/**
 * Coarse relative time.
 *
 * Deliberately imprecise past a week: an owner scanning a list needs "when,
 * roughly", and an exact timestamp on every row is noise.
 */
export function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Money.
 *
 * Takes integer cents — the only representation used anywhere in the ordering
 * module — and formats for display. Nothing converts to a float on the way in.
 */
export function formatMoney(cents: number, currency = 'EUR', locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/** Clock time for an order timeline: "18:02". */
export function formatClock(iso: string | null, locale = 'es-ES'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** "hace 20 s" / "hace 4 min" — how long a ticket has been waiting. */
export function formatWaiting(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h`;
}
