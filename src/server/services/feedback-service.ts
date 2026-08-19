import 'server-only';

import { LIMITS } from '@/lib/constants';
import { insertFeedback } from '@/server/repositories/feedback';
import { findStaffById, findStaffByCode } from '@/server/repositories/staff';
import { findActiveSuggestionsByIds } from '@/server/repositories/suggestions';
import { redeemVisitToken } from '@/server/repositories/visit-tokens';
import { hashIp, userAgentFamily } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import type { FeedbackInput } from '@/server/validation/schemas';

export type SubmitResult =
  | { ok: true; publicId: string }
  | { ok: false; reason: 'rate_limited' | 'invalid_token' | 'rejected' };

/** A human cannot read three screens and tap through them this fast. */
const MIN_HUMAN_ELAPSED_MS = 1200;

/**
 * Accepts one piece of customer feedback.
 *
 * The order of checks matters: cheap, stateless rejections come first so a
 * flood of junk never reaches the database, and the single-use token is
 * redeemed before anything is written so a replayed request cannot insert a row
 * even if it wins the race.
 */
export function submitFeedback(input: {
  data: FeedbackInput;
  ip: string | null;
  userAgent: string | null;
}): SubmitResult {
  const { data } = input;
  const ipHash = hashIp(input.ip);
  const bucket = ipHash ?? ANONYMOUS_BUCKET;

  if (!consume(RULES.feedback, bucket).allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  // Honeypot and timing checks. Both are silently "successful" from the
  // client's point of view elsewhere in the stack — telling a bot exactly which
  // signal caught it just teaches the next version to avoid it.
  if (data.website) return { ok: false, reason: 'rejected' };
  if (data.elapsedMs !== undefined && data.elapsedMs < MIN_HUMAN_ELAPSED_MS) {
    return { ok: false, reason: 'rejected' };
  }

  const visit = redeemVisitToken(data.visitToken);
  if (!visit) return { ok: false, reason: 'invalid_token' };

  // The tag the customer scanned is authoritative for which team member this is
  // about. A client-supplied staffCode is only honoured when the tag was generic,
  // so nobody can scan the counter tag and file the rating against someone else.
  const staff = visit.staffId
    ? null
    : data.staffCode
      ? findStaffByCode(data.staffCode)
      : null;

  const staffId = visit.staffId ?? staff?.id ?? null;
  const staffName = staff?.name ?? null;

  const chosen = findActiveSuggestionsByIds(data.suggestionIds);
  const wishes: Array<{ suggestionId: number | null; label: string; isCustom: boolean }> = chosen
    .slice(0, LIMITS.maxWishesPerFeedback)
    .map((s) => ({ suggestionId: s.id, label: s.label, isCustom: false }));

  if (data.customWish) {
    wishes.push({ suggestionId: null, label: data.customWish, isCustom: true });
  }

  const { publicId } = insertFeedback({
    storeRating: data.storeRating,
    staffId,
    staffNameAtTime: staffName ?? resolveStaffName(staffId),
    staffRating: staffId ? (data.staffRating ?? null) : null,
    comment: data.comment || null,
    source: visit.source,
    ipHash,
    userAgentFamily: userAgentFamily(input.userAgent),
    wishes,
  });

  return { ok: true, publicId };
}

/** Snapshot the name so a later rename or archive does not rewrite history. */
function resolveStaffName(staffId: number | null): string | null {
  if (!staffId) return null;
  return findStaffById(staffId)?.name ?? null;
}
