'use client';

import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/constants';
import type { Suggestion } from '@/types/domain';

/**
 * "What should we stock?"
 *
 * Chips come from the admin, so most customers answer with one tap and never
 * open the keyboard. The free-text box is the escape hatch for everyone else —
 * it is the field that actually tells the owner something they did not expect.
 */
export function WishPicker({
  suggestions,
  selectedIds,
  onToggle,
  customWish,
  onCustomWishChange,
}: {
  suggestions: readonly Suggestion[];
  selectedIds: readonly number[];
  onToggle: (id: number) => void;
  customWish: string;
  onCustomWishChange: (value: string) => void;
}) {
  const atLimit = selectedIds.length >= LIMITS.maxWishesPerFeedback;

  return (
    <div className="flex flex-col gap-4">
      {suggestions.length > 0 ? (
        <div className="stagger flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => {
            const selected = selectedIds.includes(suggestion.id);
            // Greying out an unreachable chip is clearer than letting the tap
            // silently do nothing.
            const disabled = atLimit && !selected;

            return (
              <button
                key={suggestion.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onToggle(suggestion.id)}
                className={cn(
                  'pressable rounded-pill px-3.5 py-2 text-[0.875rem] font-medium',
                  'transition-[background-color,color,box-shadow] duration-pop ease-out-strong',
                  selected
                    ? 'bg-brand text-white shadow-[var(--shadow-sm)]'
                    : 'bg-surface text-ink-muted ring-1 ring-line hover:text-ink hover:ring-line-strong',
                  disabled && 'pointer-events-none opacity-40',
                )}
              >
                {suggestion.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="custom-wish" className="type-caption text-center font-medium text-ink">
          Something else?
        </label>
        <input
          id="custom-wish"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={LIMITS.wishMaxLength}
          value={customWish}
          onChange={(event) => onCustomWishChange(event.target.value)}
          placeholder="Oat milk, size 42, evening opening…"
          className={cn(
            'w-full rounded-field bg-surface px-3.5 py-3 text-center text-ink',
            'ring-1 ring-line placeholder:text-ink-subtle',
            'transition-[box-shadow] duration-hover ease-out-strong',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          )}
        />
      </div>
    </div>
  );
}
