import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * A single headline number.
 *
 * The label sits above the value, not below: the eye lands on the big number
 * first and reads upward for context only when it needs to.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'caution';
}) {
  return (
    <div className="rounded-card bg-surface p-4 ring-1 ring-line/60 sm:p-5">
      <p className="type-caption font-medium">{label}</p>
      <p
        className={cn(
          'type-numeric mt-1.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]',
          tone === 'positive' && 'text-positive',
          tone === 'caution' && 'text-caution',
        )}
      >
        {value}
      </p>
      {hint ? <p className="type-caption mt-1 text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
      <p className="type-heading text-ink-muted">{title}</p>
      <p className="type-caption mx-auto mt-1.5 max-w-sm text-pretty">{description}</p>
    </div>
  );
}
