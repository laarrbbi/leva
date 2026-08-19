import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/admin/login-form';
import { getSession } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Already signed in: never render a login form over a live session.
  if (await getSession()) redirect('/admin');

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-5 py-10"
    >
      <div className="text-center">
        <h1 className="type-display">Leva</h1>
        <p className="type-caption mt-1.5">Sign in to see your store&rsquo;s feedback.</p>
      </div>

      <LoginForm />

      <p className="type-caption text-center text-ink-subtle text-pretty">
        Repeated failed attempts lock the account for 15 minutes.
      </p>
    </main>
  );
}
