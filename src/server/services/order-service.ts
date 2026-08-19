import 'server-only';

import { findOrderableProducts, listProducts } from '@/server/repositories/menu';
import { insertOrder } from '@/server/repositories/orders';
import { getSettings } from '@/server/repositories/settings';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import type { OrderInput } from '@/server/validation/schemas';
import type { Order } from '@/types/domain';

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | {
      ok: false;
      reason: 'rate_limited' | 'closed' | 'unavailable' | 'rejected' | 'payment_unavailable';
      /** Names of items that went out of stock between loading the menu and submitting. */
      unavailable?: string[];
    };

/** Nobody reads a menu, fills a basket and types their car description this fast. */
const MIN_HUMAN_ELAPSED_MS = 3000;

/**
 * Places an order.
 *
 * The rule the whole module rests on, from the concept document: **the browser
 * lies**. The request carries product ids and quantities and nothing else of
 * value; names, prices and the total are all read back from the database here.
 * A tampered client can change what it *asks* for, never what it *pays*.
 */
export function placeOrder(input: {
  data: OrderInput;
  ip: string | null;
}): PlaceOrderResult {
  const { data } = input;
  const ipHash = hashIp(input.ip);
  const bucket = ipHash ?? ANONYMOUS_BUCKET;

  if (!consume(RULES.order, bucket).allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  // Anti-automation, same pattern as the feedback endpoint: never say which
  // signal caught the caller.
  if (data.website) return { ok: false, reason: 'rejected' };
  if (data.elapsedMs !== undefined && data.elapsedMs < MIN_HUMAN_ELAPSED_MS) {
    return { ok: false, reason: 'rejected' };
  }

  const settings = getSettings();
  if (!settings.pickupEnabled || !settings.pickupAcceptingOrders) {
    return { ok: false, reason: 'closed' };
  }

  // Fase 1 collects at the car. Refusing here rather than in the UI means a
  // crafted request cannot create an order that nobody will ever charge for.
  if (data.paymentMethod === 'online') {
    return { ok: false, reason: 'payment_unavailable' };
  }

  // Merge duplicate lines before pricing: a client that sends the same product
  // twice must not be able to smuggle past the per-line quantity cap.
  const wanted = new Map<number, number>();
  for (const line of data.lines) {
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
  }

  const products = findOrderableProducts([...wanted.keys()]);
  const byId = new Map(products.map((product) => [product.id, product]));

  // Anything the query did not return is deleted, hidden or sold out — the shop
  // ran out while the customer was choosing, which is a normal Saturday.
  const missing = [...wanted.keys()].filter((id) => !byId.has(id));
  if (missing.length > 0) {
    // Name them, so the customer sees "se ha acabado la hogaza" rather than an
    // opaque failure they can only respond to by giving up.
    const names = new Map(listProducts(true).map((product) => [product.id, product.name]));
    return {
      ok: false,
      reason: 'unavailable',
      unavailable: missing.map((id) => names.get(id) ?? 'un producto'),
    };
  }

  const items = [...wanted.entries()].map(([productId, quantity]) => {
    const product = byId.get(productId)!;
    return {
      productId,
      name: product.name,
      priceCents: product.priceCents,
      quantity,
    };
  });

  // Integer arithmetic end to end. No floats touch a price at any point.
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

  const order = insertOrder({
    bay: data.bay || null,
    vehicle: data.vehicle,
    customerName: data.customerName,
    phone: data.phone || null,
    notes: data.notes || null,
    totalCents,
    currency: settings.pickupCurrency,
    paymentMethod: 'terminal',
    source: data.source,
    ipHash,
    items,
  });

  return { ok: true, order };
}
