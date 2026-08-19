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
              title="Pedidos desde el coche"
              description="El módulo de pedidos: carta, tablero en el mostrador y su propio QR por plaza."
            />
            <CardBody className="flex flex-col gap-4 pt-2">
              <div className="divide-y divide-line/60">
                <Toggle
                  name="pickupEnabled"
                  label="Activar los pedidos desde el coche"
                  description="Cuando está apagado, la carta no existe y no se genera ningún QR."
                  defaultChecked={settings.pickupEnabled}
                />
                <Toggle
                  name="pickupAcceptingOrders"
                  label="Aceptando pedidos ahora"
                  description="También se pausa desde el tablero, con un botón, en plena hora punta."
                  defaultChecked={settings.pickupAcceptingOrders}
                />
              </div>

              <Field label="Nombre" htmlFor="pickupName" error={state.fieldErrors?.pickupName}>
                <Input
                  id="pickupName"
                  name="pickupName"
                  defaultValue={settings.pickupName}
                  maxLength={LIMITS.storeNameMaxLength}
                  placeholder="Pedidos desde el coche"
                />
              </Field>

              <Field label="Frase" htmlFor="pickupTagline">
                <Input
                  id="pickupTagline"
                  name="pickupTagline"
                  defaultValue={settings.pickupTagline}
                  maxLength={LIMITS.copyMaxLength}
                  placeholder="Pide sin bajarte del coche."
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Minutos de preparación"
                  htmlFor="pickupPrepMinutes"
                  error={state.fieldErrors?.pickupPrepMinutes}
                  hint="Lo ve el cliente."
                >
                  <Input
                    id="pickupPrepMinutes"
                    name="pickupPrepMinutes"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    defaultValue={settings.pickupPrepMinutes}
                  />
                </Field>

                <Field
                  label="Plazas"
                  htmlFor="pickupBayCount"
                  error={state.fieldErrors?.pickupBayCount}
                  hint="Un QR por plaza."
                >
                  <Input
                    id="pickupBayCount"
                    name="pickupBayCount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={40}
                    defaultValue={settings.pickupBayCount}
                  />
                </Field>

                <Field label="Moneda" htmlFor="pickupCurrency">
                  <select
                    id="pickupCurrency"
                    name="pickupCurrency"
                    defaultValue={settings.pickupCurrency}
                    className="w-full rounded-field bg-surface px-3.5 py-2.5 text-ink ring-1 ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <option value="EUR">EUR €</option>
                    <option value="USD">USD $</option>
                    <option value="GBP">GBP £</option>
                  </select>
                </Field>
              </div>

              <Field
                label="Mensaje cuando está en pausa"
                htmlFor="pickupClosedMessage"
                hint="Mejor decirlo con amabilidad que dejar pedir y fallar."
              >
                <Input
                  id="pickupClosedMessage"
                  name="pickupClosedMessage"
                  defaultValue={settings.pickupClosedMessage}
                  maxLength={LIMITS.copyMaxLength}
                />
              </Field>

              <Field
                label="Enlace externo (opcional)"
                htmlFor="pickupUrl"
                error={state.fieldErrors?.pickupUrl}
                hint="Solo si prefieres que el QR lleve a otra plataforma en vez de a la carta de aquí."
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

              <p className="type-caption rounded-field bg-brand-soft px-3.5 py-3 text-pretty">
                El cobro con tarjeta desde el móvil (Stripe) llega en la Fase 2. Ahora mismo todos
                los pedidos se cobran con el datáfono en el coche, que es exactamente como arranca
                el plan.
              </p>
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
