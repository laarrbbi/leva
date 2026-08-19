import { redirect } from 'next/navigation';

import { getSettings } from '@/server/repositories/settings';

export const dynamic = 'force-dynamic';

/**
 * The root is not a landing page — it is a signpost. Anyone arriving here
 * either scanned a tag that lost its path, or is the owner looking for the
 * dashboard, so send them to the kiosk for the configured store.
 */
export default function Home() {
  redirect(`/r/${getSettings().slug}`);
}
