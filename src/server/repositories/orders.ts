import 'server-only';

import { getDb } from '@/server/db/client';
import { randomToken } from '@/server/security/hash';
import type {
  DailySummary,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Source,
} from '@/types/domain';

interface OrderRow {
  id: number;
  public_token: string;
  daily_number: number;
  service_date: string;
  status: OrderStatus;
  bay: string | null;
  vehicle: string;
  customer_name: string;
  phone: string | null;
  notes: string | null;
  total_cents: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  source: Source;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

interface ItemRow {
  id: number;
  order_id: number;
  product_id: number | null;
  name_at_time: string;
  price_cents: number;
  quantity: number;
  notes: string | null;
}

const ORDER_COLUMNS = `id, public_token, daily_number, service_date, status, bay, vehicle,
                       customer_name, phone, notes, total_cents, currency, payment_method,
                       payment_status, source, created_at, accepted_at, ready_at,
                       delivered_at, cancelled_at`;

const toItem = (row: ItemRow): OrderItem => ({
  id: row.id,
  productId: row.product_id,
  name: row.name_at_time,
  priceCents: row.price_cents,
  quantity: row.quantity,
  notes: row.notes,
});

function toOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    publicToken: row.public_token,
    dailyNumber: row.daily_number,
    serviceDate: row.service_date,
    status: row.status,
    bay: row.bay,
    vehicle: row.vehicle,
    customerName: row.customer_name,
    phone: row.phone,
    notes: row.notes,
    totalCents: row.total_cents,
    currency: row.currency,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    source: row.source,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    readyAt: row.ready_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    items,
  };
}

/** Local service day. Orders placed at 23:55 belong to that day, not to UTC's. */
export function serviceDateToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export interface NewOrder {
  bay: string | null;
  vehicle: string;
  customerName: string;
  phone: string | null;
  notes: string | null;
  totalCents: number;
  currency: string;
  paymentMethod: PaymentMethod;
  source: Source;
  ipHash: string | null;
  items: Array<{ productId: number; name: string; priceCents: number; quantity: number }>;
}

/**
 * Writes an order and its lines atomically.
 *
 * The daily number is allocated inside the same transaction as the insert, so
 * two customers submitting at once cannot be handed the same "#47" — the
 * UNIQUE (service_date, daily_number) constraint is the backstop if they
 * somehow do.
 */
export function insertOrder(input: NewOrder): Order {
  const db = getDb();
  const publicToken = randomToken(24);
  const serviceDate = serviceDateToday();

  const run = db.transaction((): number => {
    const { next } = db
      .prepare(
        `SELECT COALESCE(MAX(daily_number), 0) + 1 AS next
           FROM orders WHERE service_date = ?`,
      )
      .get(serviceDate) as { next: number };

    const info = db
      .prepare(
        `INSERT INTO orders (
           public_token, daily_number, service_date, status, bay, vehicle, customer_name,
           phone, notes, total_cents, currency, payment_method, payment_status, source, ip_hash
         ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, 'due', ?, ?)`,
      )
      .run(
        publicToken,
        next,
        serviceDate,
        input.bay,
        input.vehicle,
        input.customerName,
        input.phone,
        input.notes,
        input.totalCents,
        input.currency,
        input.paymentMethod,
        input.source,
        input.ipHash,
      );

    const orderId = Number(info.lastInsertRowid);
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, name_at_time, price_cents, quantity)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const item of input.items) {
      insertItem.run(orderId, item.productId, item.name, item.priceCents, item.quantity);
    }
    return orderId;
  });

  const id = run();
  return findOrderById(id)!;
}

function loadItems(orderIds: readonly number[]): Map<number, OrderItem[]> {
  const byOrder = new Map<number, OrderItem[]>();
  if (orderIds.length === 0) return byOrder;

  const placeholders = orderIds.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT id, order_id, product_id, name_at_time, price_cents, quantity, notes
         FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
    )
    .all(...orderIds) as ItemRow[];

  for (const row of rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(toItem(row));
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}

export function findOrderById(id: number): Order | null {
  const row = getDb().prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`).get(id) as
    | OrderRow
    | undefined;
  if (!row) return null;
  return toOrder(row, loadItems([row.id]).get(row.id) ?? []);
}

export function findOrderByToken(token: string): Order | null {
  const row = getDb()
    .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE public_token = ?`)
    .get(token) as OrderRow | undefined;
  if (!row) return null;
  return toOrder(row, loadItems([row.id]).get(row.id) ?? []);
}

/** Everything the counter tablet shows: today's live board. */
export function listActiveOrders(): Order[] {
  const rows = getDb()
    .prepare(
      `SELECT ${ORDER_COLUMNS}
         FROM orders
        WHERE status IN ('new', 'preparing', 'ready')
        ORDER BY created_at ASC`,
    )
    .all() as OrderRow[];

  const items = loadItems(rows.map((r) => r.id));
  return rows.map((row) => toOrder(row, items.get(row.id) ?? []));
}

export function listOrdersForDate(serviceDate: string): Order[] {
  const rows = getDb()
    .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE service_date = ? ORDER BY daily_number ASC`)
    .all(serviceDate) as OrderRow[];

  const items = loadItems(rows.map((r) => r.id));
  return rows.map((row) => toOrder(row, items.get(row.id) ?? []));
}

/**
 * The fulfilment state machine.
 *
 * Allowed transitions are declared here rather than checked at each call site,
 * so a double-tap on the tablet cannot walk an order backwards and a cancelled
 * order can never be resurrected into the queue.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['new', 'cancelled'],
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

const TIMESTAMP_COLUMN: Partial<Record<OrderStatus, string>> = {
  preparing: 'accepted_at',
  ready: 'ready_at',
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
};

/**
 * Moves an order forward, guarding the transition inside the UPDATE.
 *
 * The `status = ?` predicate makes this a compare-and-set: two staff tapping
 * the same card at the same moment produce one transition, not two, and the
 * loser gets `false` rather than a silently duplicated state change.
 */
export function transitionOrder(id: number, from: OrderStatus, to: OrderStatus): boolean {
  if (!canTransition(from, to)) return false;

  const column = TIMESTAMP_COLUMN[to];
  const setClause = column
    ? `status = ?, ${column} = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    : 'status = ?';

  return (
    getDb()
      .prepare(`UPDATE orders SET ${setClause} WHERE id = ? AND status = ?`)
      .run(to, id, from).changes > 0
  );
}

/** Records collection at the car. Idempotent: a second tap does not double-post. */
export function markPaidAtTerminal(orderId: number, staffUserId: number | null): boolean {
  const db = getDb();

  return db.transaction(() => {
    const order = db
      .prepare('SELECT total_cents, payment_status FROM orders WHERE id = ?')
      .get(orderId) as { total_cents: number; payment_status: PaymentStatus } | undefined;

    if (!order || order.payment_status !== 'due') return false;

    db.prepare("UPDATE orders SET payment_status = 'paid_terminal' WHERE id = ? AND payment_status = 'due'").run(
      orderId,
    );
    db.prepare(
      `INSERT INTO payments (order_id, provider, amount_cents, status, recorded_by)
       VALUES (?, 'terminal', ?, 'captured', ?)`,
    ).run(orderId, order.total_cents, staffUserId);

    return true;
  })();
}

/** Cheap change-detector for the SSE streams — avoids re-sending an unchanged board. */
export function activeOrdersVersion(): string {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(MAX(created_at), '') AS created,
              COALESCE(MAX(accepted_at), '') AS accepted,
              COALESCE(MAX(ready_at), '') AS ready,
              COALESCE(MAX(delivered_at), '') AS delivered,
              COALESCE(MAX(cancelled_at), '') AS cancelled,
              COALESCE(SUM(CASE WHEN payment_status <> 'due' THEN 1 ELSE 0 END), 0) AS paid
         FROM orders
        WHERE service_date = ?`,
    )
    .get(serviceDateToday()) as Record<string, string | number>;

  return Object.values(row).join('|');
}

export function orderVersion(token: string): string {
  const row = getDb()
    .prepare(
      `SELECT status, payment_status, COALESCE(accepted_at, '') AS a,
              COALESCE(ready_at, '') AS r, COALESCE(delivered_at, '') AS d
         FROM orders WHERE public_token = ?`,
    )
    .get(token) as Record<string, string> | undefined;

  return row ? Object.values(row).join('|') : 'missing';
}

export function getDailySummary(serviceDate: string): DailySummary {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS orders,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total_cents ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN payment_status = 'paid_online' THEN total_cents ELSE 0 END), 0) AS online,
              COALESCE(SUM(CASE WHEN payment_status = 'paid_terminal' THEN total_cents ELSE 0 END), 0) AS terminal,
              COALESCE(SUM(CASE WHEN payment_status = 'due' AND status <> 'cancelled'
                                THEN total_cents ELSE 0 END), 0) AS outstanding
         FROM orders WHERE service_date = ?`,
    )
    .get(serviceDate) as Record<string, number>;

  // Average preparation time, in minutes, over orders that actually completed.
  const prep = db
    .prepare(
      `SELECT AVG((julianday(delivered_at) - julianday(created_at)) * 24 * 60) AS minutes
         FROM orders
        WHERE service_date = ? AND delivered_at IS NOT NULL`,
    )
    .get(serviceDate) as { minutes: number | null };

  const topProducts = db
    .prepare(
      `SELECT i.name_at_time AS name, SUM(i.quantity) AS quantity
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
        WHERE o.service_date = ? AND o.status <> 'cancelled'
     GROUP BY lower(i.name_at_time)
     ORDER BY quantity DESC, name ASC
        LIMIT 10`,
    )
    .all(serviceDate) as Array<{ name: string; quantity: number }>;

  const billable = (totals.orders ?? 0) - (totals.cancelled ?? 0);

  return {
    serviceDate,
    orderCount: totals.orders ?? 0,
    deliveredCount: totals.delivered ?? 0,
    cancelledCount: totals.cancelled ?? 0,
    revenueCents: totals.revenue ?? 0,
    paidOnlineCents: totals.online ?? 0,
    collectedAtCarCents: totals.terminal ?? 0,
    outstandingCents: totals.outstanding ?? 0,
    averageTicketCents: billable > 0 ? Math.round((totals.revenue ?? 0) / billable) : 0,
    averagePrepMinutes: prep.minutes,
    topProducts,
  };
}

/**
 * Retention sweep, per the concept document: personal fields are scrubbed after
 * 30 days while the sales figures stay. An order's value is business data; the
 * customer's name and car are not.
 */
export function anonymiseOldOrders(retentionDays: number): number {
  return getDb()
    .prepare(
      `UPDATE orders
          SET customer_name = 'anónimo',
              vehicle = '—',
              phone = NULL,
              notes = NULL,
              ip_hash = NULL,
              anonymised_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE anonymised_at IS NULL
          AND created_at < datetime('now', ?)`,
    )
    .run(`-${retentionDays} days`).changes;
}
