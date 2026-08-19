'use client';

import { AdminForm, FormBanner, SubmitButton } from '@/components/admin/form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Toggle } from '@/components/ui/field';
import { LIMITS } from '@/lib/constants';
import { updateSettingsAction } from '@/server/actions/admin-actions';
import type { StoreSettings } from '@/types/domain';

/**
 * The settings form owns its own `useActionState`, which is why it is a client
 * component rather than JSX handed down from the page.
 *
 * `AdminForm` takes a render prop so each field can show its own error, and a
 * function cannot cross the server/client boundary — so the boundary is drawn
 * here, at the page edge, with only serialisable props passing through.
 */
export function SettingsForm({
  settings,
  csrfToken,
}: {
  settings: StoreSettings;
  csrfToken: string;
}) {
  return (
    <AdminForm action={updateSettingsAction} csrfToken={csrfToken}>
      {(state) => (
        <>
          <Card>
            <CardHeader title="Your store" />
            <CardBody className="flex flex-col gap-4 pt-2">
              <Field label="Store name" htmlFor="storeName" error={state.fieldErrors?.storeName}>
                <Input
                  id="storeName"
                  name="storeName"
                  defaultValue={settings.storeName}
                  required
                  maxLength={LIMITS.storeNameMaxLength}
                />
              </Field>

              <Field
                label="Tag address"
                htmlFor="slug"
                error={state.fieldErrors?.slug}
                hint="The last part of the link your QR codes and NFC tags point at. Changing it makes every printed tag stop working."
              >
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={settings.slug}
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={40}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Google reviews"
              description="Where the button on the thank-you screen sends people."
            />
            <CardBody className="flex flex-col gap-4 pt-2">
              <Field
                label="Review link"
                htmlFor="googleReviewUrl"
                error={state.fieldErrors?.googleReviewUrl}
                hint="Find it in your Google Business Profile under Ask for reviews. Only Google addresses are accepted."
              >
                <Input
                  id="googleReviewUrl"
                  name="googleReviewUrl"
                  type="url"
                  inputMode="url"
                  defaultValue={settings.googleReviewUrl ?? ''}
                  placeholder="https://g.page/r/.../review"
                  maxLength={500}
                />
              </Field>

              <Field
                label="Place ID"
                htmlFor="googlePlaceId"
                hint="Optional. Useful if you later want to rebuild the link."
              >
                <Input
                  id="googlePlaceId"
                  name="googlePlaceId"
                  defaultValue={settings.googlePlaceId ?? ''}
                  maxLength={120}
                />
              </Field>

              <p className="type-caption rounded-field bg-caution-soft px-3.5 py-3 text-caution text-pretty">
                The Google button is shown to every customer, whatever they rated you. Showing it
                only to happy customers breaks Google&rsquo;s review policy and consumer-protection
                law in the EU and US, and can get your existing reviews removed.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="What you ask" />
            <CardBody className="pt-1">
              <div className="divide-y divide-line/60">
                <Toggle
                  name="askForStaffRating"
                  label="Rate the person who served them"
                  description="Adds a step where the customer picks a name and rates them."
                  defaultChecked={settings.askForStaffRating}
                />
                <Toggle
                  name="askForWishes"
                  label="Ask what to stock next"
                  description="Shows your Wishlist chips plus a free-text box."
                  defaultChecked={settings.askForWishes}
                />
                <Toggle
                  name="askForComment"
                  label="Allow a written comment"
                  description="An optional message that only you can read."
                  defaultChecked={settings.askForComment}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Second platform"
              description="A separate destination with its own QR and NFC tag, printed apart from the review tag."
            />
            <CardBody className="flex flex-col gap-4 pt-2">
              <div className="divide-y divide-line/60">
                <Toggle
                  name="pickupEnabled"
                  label="Give this platform its own tag"
                  description="When off, no tag is generated and nothing links to it."
                  defaultChecked={settings.pickupEnabled}
                />
              </div>

              <Field label="Name" htmlFor="pickupName" error={state.fieldErrors?.pickupName}>
                <Input
                  id="pickupName"
                  name="pickupName"
                  defaultValue={settings.pickupName}
                  maxLength={LIMITS.storeNameMaxLength}
                  placeholder="Pedidos desde el coche"
                />
              </Field>

              <Field label="Tagline" htmlFor="pickupTagline">
                <Input
                  id="pickupTagline"
                  name="pickupTagline"
                  defaultValue={settings.pickupTagline}
                  maxLength={LIMITS.copyMaxLength}
                  placeholder="Pide sin bajarte del coche."
                />
              </Field>

              <Field
                label="Link"
                htmlFor="pickupUrl"
                error={state.fieldErrors?.pickupUrl}
                hint="Where the tag sends people. Must be a full https address."
              >
                <Input
                  id="pickupUrl"
                  name="pickupUrl"
                  type="url"
                  inputMode="url"
                  defaultValue={settings.pickupUrl ?? ''}
                  placeholder="https://pedidos.tu-tienda.com"
                  maxLength={500}
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Wording" description="Keep it short. People are standing up." />
            <CardBody className="flex flex-col gap-4 pt-2">
              <Field
                label="Opening question"
                htmlFor="welcomeHeadline"
                error={state.fieldErrors?.welcomeHeadline}
              >
                <Input
                  id="welcomeHeadline"
                  name="welcomeHeadline"
                  defaultValue={settings.welcomeHeadline}
                  required
                  maxLength={LIMITS.copyMaxLength}
                />
              </Field>

              <Field label="Opening subtitle" htmlFor="welcomeSubline">
                <Input
                  id="welcomeSubline"
                  name="welcomeSubline"
                  defaultValue={settings.welcomeSubline}
                  maxLength={LIMITS.copyMaxLength}
                />
              </Field>

              <Field
                label="Thank-you headline"
                htmlFor="thanksHeadline"
                error={state.fieldErrors?.thanksHeadline}
              >
                <Input
                  id="thanksHeadline"
                  name="thanksHeadline"
                  defaultValue={settings.thanksHeadline}
                  required
                  maxLength={LIMITS.copyMaxLength}
                />
              </Field>

              <Field label="Thank-you subtitle" htmlFor="thanksSubline">
                <Input
                  id="thanksSubline"
                  name="thanksSubline"
                  defaultValue={settings.thanksSubline}
                  maxLength={LIMITS.copyMaxLength}
                />
              </Field>
            </CardBody>
          </Card>

          <div className="flex items-center gap-4">
            <SubmitButton>Save settings</SubmitButton>
            <FormBanner state={state} />
          </div>
        </>
      )}
    </AdminForm>
  );
}
