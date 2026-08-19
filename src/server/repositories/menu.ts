import 'server-only';

import { getDb } from '@/server/db/client';
import type { Category, MenuCategory, Product } from '@/types/domain';

interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
}

interface ProductRow {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price_cents: number;
  emoji: string;
  image_url: string | null;
  is_sold_out: number;
  is_active: number;
  sort_order: number;
}

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  isActive: row.is_active === 1,
});

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  categoryId: row.category_id,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  emoji: row.emoji,
  imageUrl: row.image_url,
  isSoldOut: row.is_sold_out === 1,
  isActive: row.is_active === 1,
  sortOrder: row.sort_order,
});

const PRODUCT_COLUMNS = `id, category_id, name, description, price_cents, emoji,
                         image_url, is_sold_out, is_active, sort_order`;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function listCategories(includeInactive = false): Category[] {
  const rows = getDb()
    .prepare(
      `SELECT id, name, sort_order, is_active
         FROM categories
        ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY sort_order ASC, id ASC`,
    )
    .all() as CategoryRow[];
  return rows.map(toCategory);
}

export function createCategory(name: string): number {
  const db = getDb();
  const next =
    ((db.prepare('SELECT MAX(sort_order) AS m FROM categories').get() as { m: number | null }).m ??
      0) + 1;
  return Number(
    db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, next)
      .lastInsertRowid,
  );
}

export function updateCategory(id: number, input: { name: string; isActive: boolean }): void {
  getDb()
    .prepare('UPDATE categories SET name = ?, is_active = ? WHERE id = ?')
    .run(input.name, input.isActive ? 1 : 0, id);
}

/** Cascades to its products — a category with no products is the point of deleting it. */
export function deleteCategory(id: number): void {
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function listProducts(includeInactive = false): Product[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products
        ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY sort_order ASC, id ASC`,
    )
    .all() as ProductRow[];
  return rows.map(toProduct);
}

/**
 * The customer-facing menu.
 *
 * Sold-out products are returned rather than filtered out: the concept document
 * shows them struck through, which tells the customer the shop has the line at
 * all and just ran out today. Silently missing items read as a broken menu.
 */
export function getMenu(): MenuCategory[] {
  const categories = listCategories();
  const products = getDb()
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products
        WHERE is_active = 1
        ORDER BY sort_order ASC, id ASC`,
    )
    .all() as ProductRow[];

  const byCategory = new Map<number, Product[]>();
  for (const row of products) {
    const list = byCategory.get(row.category_id) ?? [];
    list.push(toProduct(row));
    byCategory.set(row.category_id, list);
  }

  return categories
    .map((category) => ({ ...category, products: byCategory.get(category.id) ?? [] }))
    .filter((category) => category.products.length > 0);
}

/**
 * Re-reads the products a customer put in their basket, straight from the
 * database.
 *
 * This is the query that makes the price authoritative. Nothing the browser
 * sent about price, name or availability is trusted — only the ids.
 */
export function findOrderableProducts(ids: readonly number[]): Product[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products
        WHERE id IN (${placeholders}) AND is_active = 1 AND is_sold_out = 0`,
    )
    .all(...ids) as ProductRow[];
  return rows.map(toProduct);
}

export interface ProductInput {
  categoryId: number;
  name: string;
  description: string;
  priceCents: number;
  emoji: string;
  imageUrl: string | null;
  isActive: boolean;
}

export function createProduct(input: ProductInput): number {
  const db = getDb();
  const next =
    ((db.prepare('SELECT MAX(sort_order) AS m FROM products').get() as { m: number | null }).m ??
      0) + 1;

  return Number(
    db
      .prepare(
        `INSERT INTO products (category_id, name, description, price_cents, emoji, image_url,
                               is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.categoryId,
        input.name,
        input.description,
        input.priceCents,
        input.emoji,
        input.imageUrl,
        input.isActive ? 1 : 0,
        next,
      ).lastInsertRowid,
  );
}

export function updateProduct(id: number, input: ProductInput): void {
  getDb()
    .prepare(
      `UPDATE products
          SET category_id = ?, name = ?, description = ?, price_cents = ?,
              emoji = ?, image_url = ?, is_active = ?
        WHERE id = ?`,
    )
    .run(
      input.categoryId,
      input.name,
      input.description,
      input.priceCents,
      input.emoji,
      input.imageUrl,
      input.isActive ? 1 : 0,
      id,
    );
}

/** The one-tap "Agotado hoy" toggle. Returns the resulting state. */
export function setProductSoldOut(id: number, soldOut: boolean): void {
  getDb().prepare('UPDATE products SET is_sold_out = ? WHERE id = ?').run(soldOut ? 1 : 0, id);
}

export function deleteProduct(id: number): void {
  // ON DELETE SET NULL on order_items keeps historic tickets intact.
  getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

/** Clears every sold-out flag — the "new day, everything is baked again" button. */
export function clearAllSoldOut(): number {
  return getDb().prepare('UPDATE products SET is_sold_out = 0 WHERE is_sold_out = 1').run().changes;
}
