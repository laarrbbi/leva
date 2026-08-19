'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { LIMITS } from '@/lib/constants';
import { formatMoney } from '@/lib/format';
import type { MenuCategory, PickupSettings, Product } from '@/types/domain';

import { MenuList } from './menu-list';
import { OrderSummary } from './order-summary';

export interface OrderFlowProps {
  menu: MenuCategory[];
  pickup: PickupSettings;
  storeName: string;
  /** Pre-filled from the per-bay QR poster (`/pedir/p/3`). */
  bay: string | null;
  source: 'qr' | 'nfc' | 'link';
}

/** productId to quantity. A plain object keeps it trivially serialisable. */
export type Basket = Record<number, number>;

/**
 * The customer's whole ordering journey: menu, basket, checkout, confirmation.
 *
 * Two screens rather than a wizard. Someone sitting in a parked car wants to
 * see what is available and what it costs without navigating, so the menu stays
 * on screen until they deliberately move to checkout.
 */
export function OrderFlow({ menu, pickup, storeName, bay, source }: OrderFlowProps) {
  const [basket, setBasket] = useState<Basket>({});
  const [screen, setScreen] = useState<'menu' | 'checkout'>('menu');

  const [vehicle, setVehicle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startedAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);

  const productsById = useMemo(() => {
    const map = new Map<number, Product>();
    for (const category of menu) {
      for (const product of category.products) map.set(product.id, product);
    }
    return map;
  }, [menu]);

  const lines = useMemo(
    () =>
      Object.entries(basket)
        .map(([id, quantity]) => ({ product: productsById.get(Number(id)), quantity }))
        .filter((line): line is { product: Product; quantity: number } => Boolean(line.product)),
    [basket, productsById],
  );

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  // Display only. The charged total is recomputed on the server from the
  // products table — see order-service.ts.
  const totalCents = lines.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setBasket((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(quantity, LIMITS.maxQuantityPerLine);
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    setStatus('sending');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          bay,
          vehicle: vehicle.trim(),
          customerName: customerName.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          paymentMethod: 'terminal',
          source,
          website: honeypot.current?.value ?? '',
          elapsedMs: Date.now() - startedAt.current,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setErrorMessage(body?.message ?? 'No hemos podido enviar el pedido. Inténtalo otra vez.');
        setStatus('error');
        return;
      }

      const body = (await response.json()) as { trackingUrl: string };
      // A full navigation, not a client transition: the tracking page is where
      // the customer now lives, and back should not return them to a basket
      // whose order has already been sent.
      window.location.href = body.trackingUrl;
    } catch {
      setErrorMessage('Sin conexión. Comprueba la cobertura e inténtalo otra vez.');
      setStatus('error');
    }
  }, [bay, customerName, lines, notes, phone, source, vehicle]);

  if (!pickup.acceptingOrders) {
    return (
      <div className="step-enter rounded-card bg-surface p-6 text-center ring-1 ring-line/60">
        <p className="type-title">Ahora mismo no</p>
        <p className="type-body mt-2 text-pretty text-ink-muted">{pickup.closedMessage}</p>
      </div>
    );
  }

  const canSubmit =
    itemCount > 0 && vehicle.trim().length >= 2 && customerName.trim().length >= 1;

  return (
    <div className="flex flex-col gap-5">
      {screen === 'menu' ? (
        <MenuList menu={menu} basket={basket} onSetQuantity={setQuantity} currency={pickup.currency} />
      ) : (
        <OrderSummary
          lines={lines}
          currency={pickup.currency}
          bay={bay}
          vehicle={vehicle}
          customerName={customerName}
          phone={phone}
          notes={notes}
          onSetQuantity={setQuantity}
          onVehicleChange={setVehicle}
          onNameChange={setCustomerName}
          onPhoneChange={setPhone}
          onNotesChange={setNotes}
          onBack={() => setScreen('menu')}
        />
      )}

      {errorMessage ? (
        <p role="alert" className="type-caption rounded-field bg-critical-soft px-4 py-3 text-critical">
          {errorMessage}
        </p>
      ) : null}

      <input
        ref={honeypot}
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="sr-only"
        style={{ position: 'absolute', left: '-9999px' }}
      />

      {/*
        The action bar is sticky at the bottom of the viewport with the total
        always visible. On a phone held one-handed, a total you have to scroll
        to find is a total nobody trusts.
      */}
      {itemCount > 0 ? (
        <div className="sticky bottom-4 z-10">
          {screen === 'menu' ? (
            <Button
              type="button"
              size="lg"
              onClick={() => setScreen('checkout')}
              className="w-full justify-between shadow-[var(--shadow-lift)]"
            >
              <span>Ver mi pedido ({itemCount})</span>
              <span className="type-numeric">{formatMoney(totalCents, pickup.currency)}</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={submit}
              disabled={!canSubmit || status === 'sending'}
              className={cn('w-full justify-between shadow-[var(--shadow-lift)]')}
            >
              <span>{status === 'sending' ? 'Enviando…' : 'Enviar pedido'}</span>
              <span className="type-numeric">{formatMoney(totalCents, pickup.currency)}</span>
            </Button>
          )}
        </div>
      ) : null}

      <p className="type-caption text-center text-pretty text-ink-subtle">
        {storeName} · te cobramos con el datáfono en tu coche · unos {pickup.prepMinutes} minutos
      </p>
    </div>
  );
}
