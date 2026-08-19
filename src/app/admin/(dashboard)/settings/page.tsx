import { ChangePasswordForm } from '@/components/admin/change-password-form';
import { SettingsForm } from '@/components/admin/settings-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { requireSession } from '@/server/auth/guard';
import { getSettings } from '@/server/repositories/settings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const settings = getSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Settings</h1>
        <p className="type-body mt-1 text-ink-muted">Everything a customer sees on the tag page.</p>
      </div>

      <SettingsForm settings={settings} csrfToken={session.csrfToken} />

      <Card>
        <CardHeader title="Your password" description="Changing it signs you out everywhere else." />
        <CardBody className="pt-2">
          <ChangePasswordForm csrfToken={session.csrfToken} />
        </CardBody>
      </Card>
    </div>
  );
}
