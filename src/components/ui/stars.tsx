import { cn } from '@/lib/cn';
import { RATING } from '@/lib/constants';

/**
 * Read-only rating display for the dashboard.
 *
 * Static markup, no client bundle: the admin views hundreds of these in a list
 * and none of them are interactive.
 */
export function Stars({
  value,
  size = 'sm',
  className,
}: {
  value: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dimension = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} title={`${value} out of ${RATING.max}`}>
      <span className="sr-only">
        {value} out of {RATING.max}
      </span>
      {Array.from({ length: RATING.max }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          aria-hidden
          className={cn(dimension, index < value ? 'fill-star' : 'fill-star-empty')}
        >
          <path d="M12 2.6l2.76 5.6 6.18.9-4.47 4.36 1.05 6.15L12 16.72l-5.52 2.9 1.05-6.15L3.06 9.1l6.18-.9L12 2.6z" />
        </svg>
      ))}
    </span>
  );
}
