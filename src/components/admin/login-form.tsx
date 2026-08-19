'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { LIMITS } from '@/lib/constants';
import { loginAction } from '@/server/actions/auth-actions';
import { IDLE } from '@/server/actions/types';

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, IDLE);

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={200}
              // The one field where autofocus is right: this page exists to be
              // typed into and nothing else competes for attention.
              autoFocus
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={LIMITS.passwordMaxLength}
            />
          </Field>

          {state.status === 'error' && state.message ? (
            <p
              role="alert"
              className="type-caption rounded-field bg-critical-soft px-3.5 py-2.5 font-medium text-critical"
            >
              {state.message}
            </p>
          ) : null}

          <SignInButton />
        </form>
      </CardBody>
    </Card>
  );
}

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} className="mt-1 w-full">
      {pending ? 'Checking…' : 'Sign in'}
    </Button>
  );
}
