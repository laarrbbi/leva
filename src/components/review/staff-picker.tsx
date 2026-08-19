'use client';

import { cn } from '@/lib/cn';
import type { StaffMember } from '@/types/domain';

/**
 * Accent classes are written out in full rather than composed at runtime
 * (`bg-${accent}-500`), because Tailwind scans source text statically — an
 * interpolated class name simply never gets generated.
 */
const ACCENT_CLASSES: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
};

export function StaffAvatar({
  initials,
  accent,
  className,
}: {
  initials: string;
  accent: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-full font-semibold tracking-tight',
        ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.indigo,
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function StaffPicker({
  staff,
  selectedId,
  onSelect,
}: {
  staff: readonly StaffMember[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Who helped you?" className="stagger grid grid-cols-2 gap-2.5">
      {staff.map((person) => {
        const selected = person.id === selectedId;
        return (
          <button
            key={person.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(person.id)}
            className={cn(
              'pressable flex items-center gap-3 rounded-field p-3 text-left',
              'transition-[box-shadow,background-color] duration-pop ease-out-strong',
              selected
                ? 'bg-brand-soft ring-2 ring-brand'
                : 'bg-surface ring-1 ring-line hover:ring-line-strong',
            )}
          >
            <StaffAvatar
              initials={person.initials}
              accent={person.accent}
              className="h-10 w-10 shrink-0 text-sm"
            />
            <span className="type-body min-w-0 truncate font-medium">{person.name}</span>
          </button>
        );
      })}
    </div>
  );
}
