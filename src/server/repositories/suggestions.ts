import 'server-only';

import { getDb } from '@/server/db/client';
import type { Suggestion } from '@/types/domain';

interface SuggestionRow {
  id: number;
  label: string;
  is_active: number;
  sort_order: number;
}

const toDomain = (row: SuggestionRow): Suggestion => ({
  id: row.id,
  label: row.label,
  isActive: row.is_active === 1,
  sortOrder: row.sort_order,
});

export function listSuggestions(includeInactive = false): Suggestion[] {
  const rows = getDb()
    .prepare(
      `SELECT id, label, is_active, sort_order
         FROM suggestions
        ${includeInactive ? '' : 'WHERE is_active = 1'}
        ORDER BY sort_order ASC, id ASC`,
    )
    .all() as SuggestionRow[];
  return rows.map(toDomain);
}

/** Filters a caller-supplied id list down to chips that actually exist and are live. */
export function findActiveSuggestionsByIds(ids: readonly number[]): Suggestion[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDb()
    .prepare(
      `SELECT id, label, is_active, sort_order
         FROM suggestions
        WHERE is_active = 1 AND id IN (${placeholders})`,
    )
    .all(...ids) as SuggestionRow[];
  return rows.map(toDomain);
}

export function createSuggestion(input: { label: string; isActive: boolean }): number {
  const db = getDb();
  const nextOrder =
    ((db.prepare('SELECT MAX(sort_order) AS m FROM suggestions').get() as { m: number | null }).m ??
      0) + 1;
  const info = db
    .prepare('INSERT INTO suggestions (label, is_active, sort_order) VALUES (?, ?, ?)')
    .run(input.label, input.isActive ? 1 : 0, nextOrder);
  return Number(info.lastInsertRowid);
}

export function updateSuggestion(id: number, input: { label: string; isActive: boolean }): void {
  getDb()
    .prepare('UPDATE suggestions SET label = ?, is_active = ? WHERE id = ?')
    .run(input.label, input.isActive ? 1 : 0, id);
}

export function deleteSuggestion(id: number): void {
  // ON DELETE SET NULL on feedback_wishes keeps the historic label text intact.
  getDb().prepare('DELETE FROM suggestions WHERE id = ?').run(id);
}
