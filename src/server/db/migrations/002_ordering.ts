/**
 * Migration 002 — "Pedidos desde el coche" (order-from-your-car).
 *
 * Implements Fase 1 of the Levadura Madre concept document: a menu, an order
 * placed from a parked car, a kitchen board for the counter tablet, and live
 * tracking for the customer.
 *
 * Two rules from that document are enforced by the schema itself rather than by
 * application code:
 *
 *  - **Money is integer cents, never a float.** `0.1 + 0.2 !== 0.3` in every
 *    IEEE-754 language, and a bakery cannot round a customer's change wrong.
 *  - **Line items copy the name and price at the moment of ordering.** When
 *    bread goes up tomorrow, yesterday's tickets must not change.
 */
export const sql = `
-- --------------------------------------------------------------------------
-- Service configuration for the ordering module, added to the existing
-- single-row settings table.
-- --------------------------------------------------------------------------
ALTER TABLE store_settings ADD COLUMN pickup_accepting_orders INTEGER NOT NULL DEFAULT 1
  CHECK (pickup_accepting_orders IN (0, 1));
ALTER TABLE store_settings ADD COLUMN pickup_prep_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE store_settings ADD COLUMN pickup_bay_count INTEGER NOT NULL DEFAULT 6;
ALTER TABLE store_settings ADD COLUMN pickup_currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE store_settings ADD COLUMN pickup_closed_message TEXT NOT NULL
  DEFAULT 'Ahora mismo no estamos aceptando pedidos. Te esperamos en el mostrador.';

-- --------------------------------------------------------------------------
-- Menu.
-- --------------------------------------------------------------------------
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_categories_active ON categories(is_active, sort_order);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  -- Integer cents. A CHECK keeps a negative price out of the till.
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  -- An emoji standing in for a photo, so the menu needs no object storage to
  -- launch. image_url is the upgrade path once photos exist.
  emoji       TEXT    NOT NULL DEFAULT '',
  image_url   TEXT,
  -- "Agotado hoy": one tap in the panel, gone from the menu instantly.
  is_sold_out INTEGER NOT NULL DEFAULT 0 CHECK (is_sold_out IN (0, 1)),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_products_category ON products(category_id, is_active, sort_order);

-- --------------------------------------------------------------------------
-- Orders.
--
-- Two independent state machines, because the bread and the money are
-- different things:
--   fulfilment: new -> preparing -> ready -> delivered   (or cancelled)
--   payment:    due -> paid_terminal | paid_online | refunded
-- --------------------------------------------------------------------------
CREATE TABLE orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The customer's only credential: an unguessable token in the tracking URL.
  -- No account, no password, no email.
  public_token   TEXT    NOT NULL UNIQUE,
  -- Short number the counter shouts across the shop (#47). Resets each day.
  daily_number   INTEGER NOT NULL,
  service_date   TEXT    NOT NULL,

  status         TEXT    NOT NULL DEFAULT 'new'
                 CHECK (status IN ('pending_payment', 'new', 'preparing', 'ready', 'delivered', 'cancelled')),

  bay            TEXT,
  vehicle        TEXT    NOT NULL,
  customer_name  TEXT    NOT NULL,
  phone          TEXT,
  notes          TEXT,

  -- Always recalculated on the server from the products table. The browser's
  -- number is display only; this one is what gets charged.
  total_cents    INTEGER NOT NULL CHECK (total_cents >= 0),
  currency       TEXT    NOT NULL DEFAULT 'EUR',

  payment_method TEXT    NOT NULL DEFAULT 'terminal' CHECK (payment_method IN ('terminal', 'online')),
  payment_status TEXT    NOT NULL DEFAULT 'due'
                 CHECK (payment_status IN ('due', 'paid_terminal', 'paid_online', 'refunded')),

  source         TEXT    NOT NULL DEFAULT 'qr' CHECK (source IN ('qr', 'nfc', 'link')),
  ip_hash        TEXT,

  -- One timestamp per transition: the daily summary's preparation times are
  -- derived from these rather than stored separately and drifting.
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  accepted_at    TEXT,
  ready_at       TEXT,
  delivered_at   TEXT,
  cancelled_at   TEXT,
  -- Set when the personal fields are scrubbed by the retention sweep.
  anonymised_at  TEXT,

  UNIQUE (service_date, daily_number)
);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_orders_date ON orders(service_date, daily_number);

CREATE TABLE order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- Nulled if the product is later deleted; the copied name and price below
  -- keep the ticket readable forever.
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name_at_time  TEXT    NOT NULL,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  notes         TEXT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- --------------------------------------------------------------------------
-- Ledger of every collection. Fase 1 writes only 'terminal' rows; the 'online'
-- provider is reserved for the Stripe phase so the accounting shape does not
-- have to change when it arrives.
-- --------------------------------------------------------------------------
CREATE TABLE payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider     TEXT    NOT NULL CHECK (provider IN ('terminal', 'stripe')),
  amount_cents INTEGER NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('captured', 'refunded')),
  -- Provider reference (a Stripe session id, or a terminal receipt number).
  -- UNIQUE gives webhook idempotency for free: one payment cannot land twice.
  reference    TEXT UNIQUE,
  recorded_by  INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_payments_order ON payments(order_id);
`;
