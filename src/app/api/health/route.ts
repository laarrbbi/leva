import { NextResponse } from 'next/server';

import { getDb } from '@/server/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the container orchestrator.
 *
 * Returns nothing but a status word — no version string, no build id, no
 * dependency list. An unauthenticated endpoint that enumerates your stack is a
 * gift to anyone matching it against a CVE feed.
 */
export async function GET(): Promise<NextResponse> {
  try {
    getDb().prepare('SELECT 1').get();
    return NextResponse.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'degraded' }, { status: 503 });
  }
}
