import assert from 'node:assert/strict';
import test from 'node:test';

import { getDb } from '../src/server/db/client';
import { createCategory, createProduct, setProductSoldOut } from '../src/server/repositories/menu';
import {
  canTransition,
  getDailySummary,
  insertOrder,
  listActiveOrders,
  markPaidAtTerminal,
  serviceDateToday,
  transitionOrder,
} from '../src/server/repositories/orders';
import { upsertSettings } from '../src/server/repositories/settings';
import { placeOrder } from '../src/server/services/order-service';
import { orderInputSchema, priceInputSchema } from '../src/server/validation/schemas';

getDb();

const BASE_SETTINGS = {
  slug: 'test-store',
  storeName: 'Test',
  welcomeHeadline: 'x',
  welcomeSubline: '',
  thanksHeadline: 'x',
  thanksSubline: '',
  googleReviewUrl: null,
  googlePlaceId: null,
  askForStaffRating: true,
  askForWishes: true,
  askForComment: true,
  pickupEnabled: true,
  pickupName: 'Pedidos desde el coche',
  pickupTagline: '',
  pickupUrl: null,
  pickupAcceptingOrders: true,
  pickupPrepMinutes: 5,
  pickupBayCount: 6,
  pickupCurrency: 'EUR',
  pickupClosedMessage: 'cerrado',
};

upsertSettings(BASE_SETTINGS);

const categoryId = createCategory('Pan');
const hogazaId = createProduct({
  categoryId,
  name: 'Hogaza de masa madre',
  description: '',
  priceCents: 420,
  emoji: '🍞',
  imageUrl: null,
  isActive: true,
});
const croissantId = createProduct({
  categoryId,
  name: 'Croissant',
  description: '',
  priceCents: 190,
  emoji: '🥐',
  imageUrl: null,
  isActive: true,
});

/**
 * Each test orders from its own address.
 *
 * Every `placeOrder` here would otherwise share the anonymous rate-limit
 * bucket and the eighth test would be throttled — which is the limiter working
 * correctly, not a failure worth asserting on in a pricing test.
 */
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

const validOrder = {
  vehicle: 'Clio blanco',
  customerName: 'María',
  bay: '3',
  elapsedMs: 9000,
};

// ---------------------------------------------------------------------------
// Pricing — the property the whole module rests on
// ---------------------------------------------------------------------------

test('the total is computed from the database, not from the request', () => {
  // The client claims the loaf costs one cent and sends its own name.
  const parsed = orderInputSchema.parse({
    ...validOrder,
    lines: [{ productId: hogazaId, quantity: 1, priceCents: 1, name: 'Gratis' }],
  });

  const result = placeOrder({ data: parsed, ip: nextIp() });
  assert.equal(result.ok, true);
  assert.ok(result.ok);

  assert.equal(result.order.totalCents, 420, 'the server price must win');
  assert.equal(result.order.items[0]?.priceCents, 420);
  assert.equal(result.order.items[0]?.name, 'Hogaza de masa madre', 'the server name must win');
});

test('quantities multiply and lines sum in integer cents', () => {
  const parsed = orderInputSchema.parse({
    ...validOrder,
    lines: [
      { productId: hogazaId, quantity: 1 },
      { productId: croissantId, quantity: 2 },
    ],
  });

  const result = placeOrder({ data: parsed, ip: nextIp() });
  assert.ok(result.ok);
  // 420 + 2 x 190 — the figure from the concept document's mockup.
  assert.equal(result.order.totalCents, 800);
});

test('a repeated product cannot be used to exceed the per-line quantity cap', () => {
  const parsed = orderInputSchema.parse({
    ...validOrder,
    lines: [
      { productId: croissantId, quantity: 50 },
      { productId: croissantId, quantity: 50 },
    ],
  });

  const result = placeOrder({ data: parsed, ip: nextIp() });
  assert.ok(result.ok);
  assert.equal(result.order.items.length, 1, 'duplicate lines must be merged');
  assert.equal(result.order.items[0]?.quantity, 100);
  assert.equal(result.order.totalCents, 100 * 190);
});

test('a sold-out product is refused, by name', () => {
  setProductSoldOut(croissantId, true);

  const parsed = orderInputSchema.parse({
    ...validOrder,
    lines: [{ productId: croissantId, quantity: 1 }],
  });
  const result = placeOrder({ data: parsed, ip: nextIp() });

  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.reason, 'unavailable');
  assert.deepEqual(result.unavailable, ['Croissant']);

  setProductSoldOut(croissantId, false);
});

test('a product that does not exist is refused', () => {
  const parsed = orderInputSchema.parse({
    ...validOrder,
    lines: [{ productId: 999_999, quantity: 1 }],
  });
  const result = placeOrder({ data: parsed, ip: nextIp() });
  assert.ok(!result.ok);
  assert.equal(result.reason, 'unavailable');
});

test('orders are refused while the shop is paused', () => {
  upsertSettings({ ...BASE_SETTINGS, pickupAcceptingOrders: false });

  const parsed = orderInputSchema.parse({
    ...validOrder,
    lines: [{ productId: hogazaId, quantity: 1 }],
  });
  const result = placeOrder({ data: parsed, ip: nextIp() });

  assert.ok(!result.ok);
  assert.equal(result.reason, 'closed');

  upsertSettings(BASE_SETTINGS);
});

test('card payment is refused until Stripe is wired', () => {
  const parsed = orderInputSchema.parse({
    ...validOrder,
    paymentMethod: 'online',
    lines: [{ productId: hogazaId, quantity: 1 }],
  });
  const result = placeOrder({ data: parsed, ip: nextIp() });

  assert.ok(!result.ok);
  assert.equal(result.reason, 'payment_unavailable');
});

test('the honeypot and the timing floor reject bots without saying which caught them', () => {
  const bot = orderInputSchema.parse({
    ...validOrder,
    website: 'http://spam.example',
    lines: [{ productId: hogazaId, quantity: 1 }],
  });
  const botResult = placeOrder({ data: bot, ip: nextIp() });
  assert.ok(!botResult.ok);
  assert.equal(botResult.reason, 'rejected');

  const tooFast = orderInputSchema.parse({
    ...validOrder,
    elapsedMs: 200,
    lines: [{ productId: hogazaId, quantity: 1 }],
  });
  const fastResult = placeOrder({ data: tooFast, ip: nextIp() });
  assert.ok(!fastResult.ok);
  assert.equal(fastResult.reason, 'rejected');
});

test('a vehicle description is required — it is how staff find the car', () => {
  assert.equal(
    orderInputSchema.safeParse({ ...validOrder, vehicle: '', lines: [{ productId: 1, quantity: 1 }] })
      .success,
    false,
  );
  assert.equal(
    orderInputSchema.safeParse({ ...validOrder, vehicle: 'a', lines: [{ productId: 1, quantity: 1 }] })
      .success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Order numbering and state
// ---------------------------------------------------------------------------

test('daily numbers increase and are unique within a service day', () => {
  const made = [1, 2, 3].map(() =>
    insertOrder({
      bay: null,
      vehicle: 'Furgoneta gris',
      customerName: 'Jorge',
      phone: null,
      notes: null,
      totalCents: 100,
      currency: 'EUR',
      paymentMethod: 'terminal',
      source: 'qr',
      ipHash: null,
      items: [{ productId: hogazaId, name: 'Hogaza', priceCents: 100, quantity: 1 }],
    }),
  );

  const numbers = made.map((order) => order.dailyNumber);
  assert.equal(new Set(numbers).size, numbers.length, 'no two orders share a number');
  assert.ok(numbers[1]! > numbers[0]!);
  assert.equal(made[0]?.serviceDate, serviceDateToday());
});

test('the state machine only moves forward', () => {
  assert.equal(canTransition('new', 'preparing'), true);
  assert.equal(canTransition('preparing', 'ready'), true);
  assert.equal(canTransition('ready', 'delivered'), true);

  assert.equal(canTransition('preparing', 'new'), false, 'no going backwards');
  assert.equal(canTransition('delivered', 'ready'), false, 'delivered is final');
  assert.equal(canTransition('cancelled', 'new'), false, 'cancelled cannot be resurrected');
  assert.equal(canTransition('new', 'delivered'), false, 'no skipping preparation');
});

test('a stale tablet cannot move an order twice', () => {
  const order = insertOrder({
    bay: '2',
    vehicle: 'Moto roja',
    customerName: 'Andrés',
    phone: null,
    notes: null,
    totalCents: 250,
    currency: 'EUR',
    paymentMethod: 'terminal',
    source: 'qr',
    ipHash: null,
    items: [{ productId: hogazaId, name: 'Hogaza', priceCents: 250, quantity: 1 }],
  });

  assert.equal(transitionOrder(order.id, 'new', 'preparing'), true);
  // A second tap from a screen that had not refreshed yet.
  assert.equal(transitionOrder(order.id, 'new', 'preparing'), false);
});

test('collection is recorded once, and only once', () => {
  const order = insertOrder({
    bay: '5',
    vehicle: 'SUV azul',
    customerName: 'Lucía',
    phone: null,
    notes: null,
    totalCents: 610,
    currency: 'EUR',
    paymentMethod: 'terminal',
    source: 'qr',
    ipHash: null,
    items: [{ productId: hogazaId, name: 'Hogaza', priceCents: 610, quantity: 1 }],
  });

  assert.equal(markPaidAtTerminal(order.id, null), true);
  assert.equal(markPaidAtTerminal(order.id, null), false, 'a second tap must not double-post');

  const payments = getDb()
    .prepare('SELECT COUNT(*) AS c FROM payments WHERE order_id = ?')
    .get(order.id) as { c: number };
  assert.equal(payments.c, 1);
});

test('the board shows only live orders', () => {
  const active = listActiveOrders();
  assert.ok(active.every((order) => ['new', 'preparing', 'ready'].includes(order.status)));
});

test('the daily summary separates what is collected from what is still owed', () => {
  const summary = getDailySummary(serviceDateToday());
  assert.ok(summary.orderCount > 0);
  assert.equal(
    summary.revenueCents,
    summary.collectedAtCarCents + summary.paidOnlineCents + summary.outstandingCents,
    'every cent is either collected or outstanding',
  );
});

// ---------------------------------------------------------------------------
// Price entry
// ---------------------------------------------------------------------------

test('typed prices become integer cents, comma or dot', () => {
  assert.equal(priceInputSchema.parse('4,20'), 420);
  assert.equal(priceInputSchema.parse('4.20'), 420);
  assert.equal(priceInputSchema.parse('18'), 1800);
  assert.equal(priceInputSchema.parse('0,05'), 5);
  // The classic float trap: 0.1 + 0.2 !== 0.3. Integers make it a non-issue.
  assert.equal(priceInputSchema.parse('0,10') + priceInputSchema.parse('0,20'), 30);
});

test('a malformed price is rejected rather than silently rounded', () => {
  for (const bad of ['', 'gratis', '4,205', '-1', '4,2,0', '1e3']) {
    assert.equal(priceInputSchema.safeParse(bad).success, false, bad);
  }
});
