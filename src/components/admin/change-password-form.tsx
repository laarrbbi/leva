'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Field, Input } from '@/components/ui/field';
import { LIMITS } from '@/lib/constants';
import { changePasswordAction } from '@/server/actions/auth-actions';

export function ChangePasswordForm({ csrfToken }: { csrfToken: string }) {
  return (
    <AdminForm action={changePasswordAction} csrfToken={csrfToken} resetOnSuccess>
      {(state) => (
        <>
          <Field
            label="Current password"
            htmlFor="currentPassword"
            error={state.fieldErrors?.currentPassword}
          >
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={LIMITS.passwordMaxLength}
            />
          </Field>

          <Field
            label="New password"
            htmlFor="newPassword"
            error={state.fieldErrors?.newPassword}
            // Length, not "one symbol and one capital". Composition rules push
            // people towards predictable substitutions; length is what actually
            // costs an attacker time.
            hint={`At least ${LIMITS.passwordMinLength} characters. A short sentence works well.`}
          >
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={LIMITS.passwordMinLength}
              maxLength={LIMITS.passwordMaxLength}
            />
          </Field>

          <Field
            label="Repeat new password"
            htmlFor="confirmPassword"
            error={state.fieldErrors?.confirmPassword}
          >
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              maxLength={LIMITS.passwordMaxLength}
            />
          </Field>

          <div className="flex items-center gap-4">
            <SubmitButton variant="secondary" pendingLabel="Updating…">
              Update password
            </SubmitButton>
            <FormBanner state={state} />
          </div>
        </>
      )}
    </AdminForm>
  );
}
