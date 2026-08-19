import 'server-only';

import { getDb } from '@/server/db/client';
import { randomToken } from '@/server/security/hash';
import type { DashboardStats, FeedbackEntry, Source, WishTally } from '@/types/domain';

/**
 * Unit Separator. Safe as a `group_concat` delimiter because validation strips
 * every control character from user input, so it can never occur inside a label.
 */
const WISH_DELIMITER = '\u001F';

export interface NewFeedback {
  storeRating: number;
  staffId: number | null;
  staffNameAtTime: string | null;
  staffRating: number | null;
  comment: string | null;
  source: Source;
  ipHash: string | null;
  userAgentFamily: string | null;
  wishes: Array<{ suggestionId: number | null; label: string; isCustom: boolean }>;
}

/**
 * Writes the feedback row and its wishes atomically. A partial write would show
 * up in the dashboard as a rating with no context, which the owner cannot tell
 * apart from a customer who simply skipped the step.
 */
export function insertFeedback(input: NewFeedback): { id: number; publicId: string } {
  const db = getDb();
  const publicId = randomToken(16);

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO feedback (
           public_id, store_rating, staff_id, staff_name_at_time, staff_rating,
           comment, source, ip_hash, user_agent_family
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        publicId,
        input.storeRating,
        input.staffId,
        input.staffNameAtTime,
        input.staffRating,
        input.comment,
        input.source,
        input.ipHash,
        input.userAgentFamily,
      );

    const feedbackId = Number(info.lastInsertRowid);
    const insertWish = db.prepare(
      `INSERT INTO feedback_wishes (feedback_id, suggestion_id, label, is_custom)
       VALUES (?, ?, ?, ?)`,
    );
    for (const wish of input.wishes) {
      insertWish.run(feedbackId, wish.suggestionId, wish.label, wish.isCustom ? 1 : 0);
    }
    return feedbackId;
  });

  return { id: run(), publicId };
}

/** Idempotent: a customer bouncing back and forth to Google counts once. */
export function markGoogleCtaClicked(publicId: string): boolean {
  const info = getDb()
    .prepare(
      `UPDATE feedback
          SET google_cta_clicked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE public_id = ? AND google_cta_clicked_at IS NULL`,
    )
    .run(publicId);
  return info.changes > 0;
}

interface FeedbackRow {
  id: number;
  public_id: string;
  store_rating: number;
  staff_id: number | null;
  staff_name_at_time: string | null;
  staff_rating: number | null;
  comment: string | null;
  source: Source;
  google_cta_clicked_at: string | null;
  created_at: string;
  wishes: string | null;
}

export interface FeedbackFilter {
  limit?: number;
  offset?: number;
  minRating?: number;
  maxRating?: number;
  staffId?: number;
}

export function listFeedback(filter: FeedbackFilter = {}): FeedbackEntry[] {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  const where: string[] = [];
  const params: Record<string, number> = { limit, offset };
  if (filter.minRating !== undefined) {
    where.push('f.store_rating >= @minRating');
    params.minRating = filter.minRating;
  }
  if (filter.maxRating !== undefined) {
    where.push('f.store_rating <= @maxRating');
    params.maxRating = filter.maxRating;
  }
  if (filter.staffId !== undefined) {
    where.push('f.staff_id = @staffId');
    params.staffId = filter.staffId;
  }

  const rows = getDb()
    .prepare(
      `SELECT f.id, f.public_id, f.store_rating, f.staff_id, f.staff_name_at_time,
              f.staff_rating, f.comment, f.source, f.google_cta_clicked_at, f.created_at,
              (SELECT group_concat(w.label, char(31)) FROM feedback_wishes w
                WHERE w.feedback_id = f.id) AS wishes
         FROM feedback f
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY f.created_at DESC
        LIMIT @limit OFFSET @offset`,
    )
    .all(params) as FeedbackRow[];

  return rows.map((r) => ({
    id: r.id,
    publicId: r.public_id,
    storeRating: r.store_rating,
    staffId: r.staff_id,
    staffName: r.staff_name_at_time,
    staffRating: r.staff_rating,
    comment: r.comment,
    source: r.source,
    googleCtaClickedAt: r.google_cta_clicked_at,
    createdAt: r.created_at,
    wishes: r.wishes ? r.wishes.split(WISH_DELIMITER) : [],
  }));
}

export function countFeedback(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM feedback').get() as { c: number }).c;
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT COUNT(*)                                   AS total,
              AVG(CAST(store_rating AS REAL))            AS avg_store,
              AVG(CAST(staff_rating AS REAL))            AS avg_staff,
              SUM(CASE WHEN google_cta_clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicks,
              SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7
         FROM feedback`,
    )
    .get() as {
    total: number;
    avg_store: number | null;
    avg_staff: number | null;
    clicks: number | null;
    last7: number | null;
  };

  const histogramRows = db
    .prepare('SELECT store_rating AS rating, COUNT(*) AS count FROM feedback GROUP BY store_rating')
    .all() as Array<{ rating: number; count: number }>;

  const byRating = new Map(histogramRows.map((r) => [r.rating, r.count]));

  return {
    totalFeedback: totals.total,
    feedbackLast7Days: totals.last7 ?? 0,
    averageStoreRating: totals.avg_store,
    averageStaffRating: totals.avg_staff,
    googleClickThroughRate: totals.total > 0 ? (totals.clicks ?? 0) / totals.total : null,
    ratingHistogram: [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: byRating.get(rating) ?? 0,
    })),
  };
}

/** The "what should we stock?" leaderboard. */
export function listWishTally(limit = 20): WishTally[] {
  const rows = getDb()
    .prepare(
      `SELECT label, COUNT(*) AS count, MAX(is_custom) AS is_custom
         FROM feedback_wishes
        GROUP BY lower(label)
        ORDER BY count DESC, label ASC
        LIMIT ?`,
    )
    .all(limit) as Array<{ label: string; count: number; is_custom: number }>;

  return rows.map((r) => ({ label: r.label, count: r.count, isCustom: r.is_custom === 1 }));
}

/**
 * Data-retention sweep. Comments are the only free text a customer can leave,
 * so they carry the only meaningful re-identification risk; ratings are kept
 * indefinitely because aggregate history is the point of the product.
 */
export function redactOldComments(retentionDays: number): number {
  const info = getDb()
    .prepare(
      `UPDATE feedback
          SET comment = NULL, ip_hash = NULL
        WHERE comment IS NOT NULL
          AND created_at < datetime('now', ?)`,
    )
    .run(`-${retentionDays} days`);
  return info.changes;
}
