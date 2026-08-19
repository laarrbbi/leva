import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

const control =
  'w-full rounded-field bg-surface px-3.5 py-2.5 text-ink ' +
  'ring-1 ring-line placeholder:text-ink-subtle ' +
  'transition-[box-shadow,background-color] duration-hover ease-out-strong ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
  'disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="type-caption font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="type-caption text-critical">
          {error}
        </p>
      ) : hint ? (
        <p className="type-caption">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'resize-none', className)} {...props} />;
}

/**
 * Checkbox rendered as a switch.
 *
 * The real input stays in the DOM (peer) rather than being replaced by a div:
 * keyboard, form submission and screen readers all keep working for free.
 */
export function Toggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  const id = `toggle-${name}`;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="type-body font-medium text-ink">
          {label}
        </label>
        {description ? <p className="type-caption mt-0.5">{description}</p> : null}
      </div>
      <label className="relative shrink-0 cursor-pointer pt-0.5">
        <input
          id={id}
          type="checkbox"
          name={name}
          value="true"
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'block h-6 w-10 rounded-pill bg-line-strong',
            'transition-colors duration-pop ease-out-strong',
            'peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2',
            'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-0.5 top-1 block h-5 w-5 rounded-full bg-white',
            'shadow-[var(--shadow-sm)]',
            // Only transform animates: it is composited, so the knob never
            // triggers layout while it slides.
            'transition-transform duration-pop ease-out-strong',
            'peer-checked:translate-x-4',
          )}
        />
      </label>
    </div>
  );
}
