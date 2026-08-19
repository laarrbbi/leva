'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { CSRF_FIELD } from '@/lib/constants';
import { IDLE, type ActionState } from '@/server/actions/types';

/**
 * Every admin form goes through here.
 *
 * Centralising it means the CSRF token cannot be forgotten on a new form — the
 * kind of omission that is invisible in review and only shows up in a pen test.
 */
export function AdminForm({
  action,
  csrfToken,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  csrfToken: string;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === 'success') formRef.current?.reset();
  }, [resetOnSuccess, state]);

  return (
    <form ref={formRef} action={formAction} className={cn('flex flex-col gap-4', className)}>
      <input type="hidden" name={CSRF_FIELD} value={csrfToken} />
      {children(state)}
    </form>
  );
}

/**
 * Result banner.
 *
 * `aria-live="polite"` announces the outcome without stealing focus, and the
 * reserved height keeps the form from jumping when a message appears.
 */
export function FormBanner({ state }: { state: ActionState }) {
  if (state.status === 'idle' || !state.message) return null;

  return (
    <p
      aria-live="polite"
      className={cn(
        'type-caption rounded-field px-3.5 py-2.5 font-medium',
        // Enters with opacity and a small rise, never from scale(0).
        'animate-[rise-in_200ms_var(--ease-out-strong)_both]',
        state.status === 'success'
          ? 'bg-positive-soft text-positive'
          : 'bg-critical-soft text-critical',
      )}
    >
      {state.message}
    </p>
  );
}

/**
 * Submit button wired to the parent form's pending state.
 *
 * `useFormStatus` must be read from a child of the form, which is why this is a
 * separate component rather than a prop on `AdminForm`.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  variant = 'primary',
  size = 'md',
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Destructive submit that asks once before firing. */
export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingLabel = 'Removing…',
}: {
  children: ReactNode;
  confirmMessage: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={(event) => {
        // A confirmation dialog is reserved for genuinely destructive actions.
        // Used on every button it would just train people to click through.
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
