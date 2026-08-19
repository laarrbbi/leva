'use client';

import { useId, useState } from 'react';

import { cn } from '@/lib/cn';
import { RATING } from '@/lib/constants';

const STARS = Array.from({ length: RATING.max }, (_, i) => i + 1);

/** Words matter more than the number: they tell the customer the scale is honest. */
const LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Not great',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

interface StarRatingProps {
  name: string;
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  size?: 'md' | 'lg';
}

/**
 * A radio group that looks like stars.
 *
 * Real `<input type="radio">` elements do the work: arrow keys, tab order,
 * screen-reader announcements and form serialisation all come for free, and the
 * SVG is purely decorative on top. Rebuilding this with divs would mean
 * reimplementing every one of those behaviours by hand and getting some wrong.
 */
export function StarRating({ name, value, onChange, label, size = 'lg' }: StarRatingProps) {
  const groupId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const shown = hovered ?? value ?? 0;
  const dimension = size === 'lg' ? 'h-11 w-11 sm:h-12 sm:w-12' : 'h-8 w-8';

  return (
    <fieldset
      className="flex flex-col items-center gap-3"
      onMouseLeave={() => setHovered(null)}
    >
      <legend className="sr-only">{label}</legend>

      <div className="flex items-center gap-1 sm:gap-1.5">
        {STARS.map((star) => {
          const id = `${groupId}-${star}`;
          const filled = star <= shown;

          return (
            <div key={star} className="relative">
              <input
                id={id}
                type="radio"
                name={name}
                value={star}
                checked={value === star}
                onChange={() => onChange(star)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                title={LABELS[star]}
                onMouseEnter={() => setHovered(star)}
                onFocus={() => setHovered(star)}
                onBlur={() => setHovered(null)}
                className={cn(
                  'pressable block cursor-pointer p-0.5',
                  'peer-focus-visible:outline peer-focus-visible:outline-2',
                  'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
                  'peer-focus-visible:rounded-lg',
                )}
              >
                <span className="sr-only">
                  {star} of {RATING.max} — {LABELS[star]}
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className={cn(
                    dimension,
                    // Only fill and transform animate — both composited-friendly,
                    // neither triggers layout.
                    'transition-[fill,transform] duration-pop ease-out-strong',
                    filled ? 'fill-star' : 'fill-star-empty',
                    // Selected stars sit a hair larger. Subtle enough that you
                    // feel it rather than see it.
                    filled && 'scale-105',
                  )}
                >
                  <path d="M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.72l-5.52 2.9 1.05-6.15L3.06 9.1l6.18-.9L12 2.6z" />
                </svg>
              </label>
            </div>
          );
        })}
      </div>

      {/*
        Fixed height so the caption appearing never reflows the stars above it.
        A layout shift here would move the tap target out from under the finger.
      */}
      <p
        aria-live="polite"
        className={cn(
          'type-caption h-5 font-medium tabular-nums',
          'transition-opacity duration-pop ease-out-strong',
          shown ? 'opacity-100' : 'opacity-0',
        )}
      >
        {shown ? LABELS[shown] : ' '}
      </p>
    </fieldset>
  );
}
