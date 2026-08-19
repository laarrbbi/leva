import { NextResponse } from 'next/server';

import { submitFeedback } from '@/server/services/feedback-service';
import { getClientIp, getUserAgent, isSameOrigin } from '@/server/security/request';
import { feedbackInputSchema } from '@/server/validation/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reject oversized bodies before parsing rather than after. */
const MAX_BODY_BYTES = 8 * 1024;

/**
 * The only unauthenticated write in the application.
 *
 * Everything it accepts is either validated here or re-derived server-side from
 * the single-use visit token, so a caller cannot decide which team member a
 * rating lands on, replay a submission, or smuggle in a wish for a suggestion
 * chip that is not live.
 *
 * Failure responses are deliberately vague. A bot that learns *which* check
 * caught it is a bot that can be tuned to pass next time.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isSameOrigin())) {
    return NextResponse.json({ message: 'Request rejected.' }, { status: 403 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ message: 'That is too long to send.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request rejected.' }, { status: 400 });
  }

  const parsed = feedbackInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Please check your answers and try again.' }, { status: 400 });
  }

  const result = submitFeedback({
    data: parsed.data,
    ip: await getClientIp(),
    userAgent: await getUserAgent(),
  });

  if (!result.ok) {
    if (result.reason === 'rate_limited') {
      return NextResponse.json(
        { message: 'Too many submissions from this connection. Try again shortly.' },
        { status: 429, headers: { 'retry-after': '600' } },
      );
    }
    if (result.reason === 'invalid_token') {
      return NextResponse.json(
        { message: 'This page has expired. Please scan the tag again.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: 'Request rejected.' }, { status: 400 });
  }

  return NextResponse.json({ publicId: result.publicId }, { status: 201 });
}
