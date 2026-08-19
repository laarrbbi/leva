'use client';

import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { LIMITS } from '@/lib/constants';
import { formatMoney } from '@/lib/format';
import type { Product } from '@/types/domain';

import { QuantityStepper } from './menu-list';

/**
 * Checkout.
 *
 * Two required fields and nothing else. The concept document is explicit that
 * there is no account, no password and no email — the whole reason this works
 * from a parked car is that it asks for the minimum needed to find the car
 * again.
 */
export function OrderSummary({
  lines,
  currency,
  bay,
  vehicle,
  customerName,
  phone,
  notes,
  onSetQuantity,
  onVehicleChange,
  onNameChange,
  onPhoneChange,
  onNotesChange,
  onBack,
}: {
  lines: Array<{ product: Product; quantity: number }>;
  currency: string;
  bay: string | null;
  vehicle: string;
  customerName: string;
  phone: string;
  notes: string;
  onSetQuantity: (productId: number, quantity: number) => void;
  onVehicleChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onBack: () => void;
}) {
  const totalCents = lines.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0);

  return (
    <div className="step-enter flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ← Seguir comprando
        </Button>
      </div>

      <section className="rounded-card bg-surface p-4 ring-1 ring-line/60">
        <h2 className="type-heading">Tu pedido</h2>

        <ul className="mt-3 flex flex-col divide-y divide-line/60">
          {lines.map((line) => (
            <li key={line.product.id} className="flex items-center gap-3 py-3 first:pt-0">
              <span aria-hidden className="text-xl">
                {line.product.emoji || '🥖'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="type-body truncate font-medium">{line.product.name}</p>
                <p className="type-caption type-numeric">
                  {formatMoney(line.product.priceCents, currency)} · unidad
                </p>
              </div>
              <QuantityStepper
                value={line.quantity}
                label={line.product.name}
                onChange={(next) => onSetQuantity(line.product.id, next)}
              />
              <span className="type-numeric w-16 shrink-0 text-right font-semibold">
                {formatMoney(line.product.priceCents * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="type-heading">Total</span>
          <span className="type-numeric text-xl font-semibold">
            {formatMoney(totalCents, currency)}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-card bg-surface p-4 ring-1 ring-line/60">
        <div>
          <h2 className="type-heading">¿Dónde estás?</h2>
          <p className="type-caption mt-0.5">
            {bay
              ? `Plaza ${bay}. Salimos a tu coche con la bolsa.`
              : 'Dinos cómo reconocer tu coche para llevarte la bolsa.'}
          </p>
        </div>

        <Field
          label="Tu coche"
          htmlFor="vehicle"
          hint="Por ejemplo: Clio blanco, furgoneta gris, moto roja"
        >
          <Input
            id="vehicle"
            value={vehicle}
            onChange={(event) => onVehicleChange(event.target.value)}
            maxLength={LIMITS.vehicleMaxLength}
            autoComplete="off"
            placeholder="Clio blanco"
            required
          />
        </Field>

        <Field label="Tu nombre" htmlFor="customer-name">
          <Input
            id="customer-name"
            value={customerName}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={LIMITS.customerNameMaxLength}
            autoComplete="given-name"
            placeholder="María"
            required
          />
        </Field>

        <Field
          label="Teléfono (opcional)"
          htmlFor="phone"
          hint="Solo lo usamos si hay algún problema con tu pedido."
        >
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => onPhoneChange(event.target.value)}
            maxLength={32}
            autoComplete="tel"
          />
        </Field>

        <Field label="Alguna nota (opcional)" htmlFor="order-notes">
          <Textarea
            id="order-notes"
            rows={2}
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            maxLength={LIMITS.orderNotesMaxLength}
            placeholder="Sin bolsa, por favor"
          />
        </Field>
      </section>

      {/*
        Fase 1 collects at the car, exactly as the concept document plans it —
        the terminal already works in the shop, so the flow ships and gets used
        before Stripe is introduced. The card option appears here in Fase 2.
      */}
      <section className="rounded-card bg-brand-soft p-4">
        <p className="type-body font-medium text-ink">Pagas al recibirlo</p>
        <p className="type-caption mt-0.5 text-pretty">
          Salimos a tu coche con la bolsa y el datáfono. Tarjeta o móvil, como prefieras.
        </p>
      </section>
    </div>
  );
}
