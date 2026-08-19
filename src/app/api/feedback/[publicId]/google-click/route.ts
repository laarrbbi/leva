import { NextResponse } from 'next/server';

import { markGoogleCtaClicked } from '@/server/repositories/feedback';
import { hashIp } from '@/server/security/hash';
import { ANONYMOUS_BUCKET, RULES, consume } from '@/server/security/rate-limit';
import { getClientIp, isSameOrigin } from '@/server/security/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A public id is 16 random bytes, base64url-encoded. */
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{20,32}$/;

/**
 * Records that the customer tapped through to Google.
 *
 * This measures the hand-off only. We never learn whether a review was written
 * or what it said — Google does not tell us, and asking would mean tracking the
 * customer off-site. The number the owner sees is "how many people we sent",
 * not "how many people reviewed", and the dashboard says so.
 *
 * Always answers 204, whether or not the id matched: a distinguishable response
 * would turn this into an oracle for probing which feedback ids exist.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ publicId: string }> },
): Promise<NextResponse> {
  if (!(await isSameOrigin())) {
    return new NextResponse(null, { status: 403 });
  }

  const ipHash = hashIp(await getClientIp());
  if (!consume(RULES.googleClick, ipHash ?? ANONYMOUS_BUCKET).allowed) {
    return new NextResponse(null, { status: 429 });
  }

  const { publicId } = await context.params;
  if (PUBLIC_ID_PATTERN.test(publicId)) {
    markGoogleCtaClicked(publicId);
  }

  return new NextResponse(null, { status: 204 });
}
