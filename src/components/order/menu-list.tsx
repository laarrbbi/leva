'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import type { MenuCategory, Product } from '@/types/domain';

import type { Basket } from './order-flow';

/**
 * The menu.
 *
 * Categories are tabs rather than one long scroll: a bakery has four or five,
 * and a customer in a car should reach "Bollería" in one tap instead of a
 * thumb-drag past everything else.
 */
export function MenuList({
  menu,
  basket,
  onSetQuantity,
  currency,
}: {
  menu: MenuCategory[];
  basket: Basket;
  onSetQuantity: (productId: number, quantity: number) => void;
  currency: string;
}) {
  const [activeId, setActiveId] = useState<number | null>(menu[0]?.id ?? null);
  const active = menu.find((category) => category.id === activeId) ?? menu[0];

  if (!active) {
    return (
      <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
        <p className="type-heading text-ink-muted">La carta está vacía</p>
        <p className="type-caption mt-1">Vuelve a intentarlo en un rato.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {menu.length > 1 ? (
        <nav
          aria-label="Categorías"
          // Horizontal scroll rather than wrapping: the tab row must never push
          // the first product below the fold.
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {menu.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-current={category.id === active.id ? 'true' : undefined}
              onClick={() => setActiveId(category.id)}
              className={cn(
                'pressable shrink-0 rounded-pill px-4 py-2 text-[0.9375rem] font-medium',
                'transition-colors duration-hover ease-out-strong',
                category.id === active.id
                  ? 'bg-brand text-white'
                  : 'bg-surface text-ink-muted ring-1 ring-line',
              )}
            >
              {category.name}
            </button>
          ))}
        </nav>
      ) : null}

      <ul key={active.id} className="stagger flex flex-col gap-2.5">
        {active.products.map((product) => (
          <li key={product.id}>
            <ProductRow
              product={product}
              quantity={basket[product.id] ?? 0}
              onSetQuantity={onSetQuantity}
              currency={currency}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductRow({
  product,
  quantity,
  onSetQuantity,
  currency,
}: {
  product: Product;
  quantity: number;
  onSetQuantity: (productId: number, quantity: number) => void;
  currency: string;
}) {
  const soldOut = product.isSoldOut;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-card bg-surface p-3 ring-1 transition-[box-shadow] duration-pop ease-out-strong',
        quantity > 0 ? 'ring-2 ring-brand' : 'ring-line/60',
        soldOut && 'opacity-55',
      )}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-field bg-surface-sunken text-2xl"
      >
        {product.emoji || '🥖'}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('type-body font-medium', soldOut && 'line-through')}>{product.name}</p>
        <p className="type-caption truncate">
          {soldOut ? 'Agotado hoy' : product.description || ' '}
        </p>
        <p className="type-numeric mt-0.5 text-[0.9375rem] font-semibold">
          {formatMoney(product.priceCents, currency)}
        </p>
      </div>

      {soldOut ? null : quantity === 0 ? (
        <button
          type="button"
          onClick={() => onSetQuantity(product.id, 1)}
          aria-label={`Añadir ${product.name}`}
          className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-semibold text-white"
        >
          +
        </button>
      ) : (
        <QuantityStepper
          value={quantity}
          label={product.name}
          onChange={(next) => onSetQuantity(product.id, next)}
        />
      )}
    </div>
  );
}

/**
 * Minus / count / plus.
 *
 * Both buttons are full 44 px targets even though the number between them is
 * small — this is operated with a thumb, sometimes in sunlight, sometimes by
 * someone who has just parked.
 */
export function QuantityStepper({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-pill bg-surface-sunken p-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label={`Quitar uno de ${label}`}
        className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg font-semibold ring-1 ring-line"
      >
        −
      </button>
      <span aria-live="polite" className="type-numeric w-6 text-center font-semibold">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={`Añadir otro ${label}`}
        className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white"
      >
        +
      </button>
    </div>
  );
}
