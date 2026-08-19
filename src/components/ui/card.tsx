import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export function Card({
  className,
  children,
  ...props
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface shadow-[var(--shadow-card)]',
        // A hairline in a translucent ink rather than a solid grey border:
        // it reads as an edge catching light, not as a drawn outline.
        'ring-1 ring-line/60',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-5 pt-5 sm:px-6 sm:pt-6">
      <h2 className="type-heading text-ink">{title}</h2>
      {description ? <p className="type-caption mt-1">{description}</p> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('p-5 sm:p-6', className)}>{children}</div>;
}
