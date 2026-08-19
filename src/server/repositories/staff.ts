import 'server-only';

import { getDb } from '@/server/db/client';
import { randomToken } from '@/server/security/hash';
import type { Accent } from '@/server/validation/schemas';
import type { StaffMember, StaffScore } from '@/types/domain';

interface StaffRow {
  id: number;
  code: string;
  name: string;
  initials: string;
  accent: string;
  is_active: number;
  sort_order: number;
}

function toDomain(row: StaffRow): StaffMember {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    initials: row.initials,
    accent: row.accent as Accent,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}

/** Two initials from a display name. Falls back gracefully for single-word names. */
export function deriveInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

export function listStaff(includeInactive = false): StaffMember[] {
  const rows = getDb()
    .prepare(
      `SELECT id, code, name, initials, accent, is_active, sort_order
         FROM staff
        WHERE archived_at IS NULL ${includeInactive ? '' : 'AND is_active = 1'}
        ORDER BY sort_order ASC, name ASC`,
    )
    .all() as StaffRow[];
  return rows.map(toDomain);
}

export function findStaffByCode(code: string): StaffMember | null {
  const row = getDb()
    .prepare(
      `SELECT id, code, name, initials, accent, is_active, sort_order
         FROM staff WHERE code = ? AND archived_at IS NULL`,
    )
    .get(code) as StaffRow | undefined;
  return row ? toDomain(row) : null;
}

export function findStaffById(id: number): StaffMember | null {
  const row = getDb()
    .prepare(
      `SELECT id, code, name, initials, accent, is_active, sort_order
         FROM staff WHERE id = ?`,
    )
    .get(id) as StaffRow | undefined;
  return row ? toDomain(row) : null;
}

export function createStaff(input: { name: string; accent: Accent; isActive: boolean }): StaffMember {
  const db = getDb();
  const nextOrder =
    ((db.prepare('SELECT MAX(sort_order) AS m FROM staff').get() as { m: number | null }).m ?? 0) + 1;

  // A short random code, not the row id: person-specific tags are printed and
  // stuck on a counter, and sequential ids would let anyone enumerate the team.
  const code = randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

  const info = db
    .prepare(
      `INSERT INTO staff (code, name, initials, accent, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(code, input.name, deriveInitials(input.name), input.accent, input.isActive ? 1 : 0, nextOrder);

  return {
    id: Number(info.lastInsertRowid),
    code,
    name: input.name,
    initials: deriveInitials(input.name),
    accent: input.accent,
    isActive: input.isActive,
    sortOrder: nextOrder,
  };
}

export function updateStaff(
  id: number,
  input: { name: string; accent: Accent; isActive: boolean },
): void {
  getDb()
    .prepare(
      `UPDATE staff SET name = ?, initials = ?, accent = ?, is_active = ?
        WHERE id = ? AND archived_at IS NULL`,
    )
    .run(input.name, deriveInitials(input.name), input.accent, input.isActive ? 1 : 0, id);
}

/**
 * Soft delete. Ratings already given stay in the database (and in the store
 * average) but the person disappears from every list — removing a name from a
 * screen must not silently rewrite last month's numbers.
 */
export function archiveStaff(id: number): void {
  getDb()
    .prepare(
      `UPDATE staff
          SET archived_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), is_active = 0
        WHERE id = ?`,
    )
    .run(id);
}

export function listStaffScores(): StaffScore[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, s.initials, s.accent, s.is_active,
              COUNT(f.staff_rating)          AS rating_count,
              AVG(CAST(f.staff_rating AS REAL)) AS average_rating
         FROM staff s
    LEFT JOIN feedback f ON f.staff_id = s.id AND f.staff_rating IS NOT NULL
        WHERE s.archived_at IS NULL
     GROUP BY s.id
     ORDER BY average_rating DESC NULLS LAST, s.name ASC`,
    )
    .all() as Array<{
    id: number;
    name: string;
    initials: string;
    accent: string;
    is_active: number;
    rating_count: number;
    average_rating: number | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    initials: r.initials,
    accent: r.accent as Accent,
    isActive: r.is_active === 1,
    ratingCount: r.rating_count,
    averageRating: r.average_rating,
  }));
}
