/**
 * Seeds a fresh database with a store, an administrator and enough sample
 * content to see the whole product working.
 *
 * Safe to re-run: the store row is upserted and the sample rows are only
 * inserted when their tables are empty, so running this against a live database
 * will not duplicate or overwrite real data.
 *
 * The administrator password comes from SEED_ADMIN_PASSWORD and is never
 * written to the database in plaintext or echoed back to the terminal.
 */
import { getDb } from '../src/server/db/client';
import { createStaff } from '../src/server/repositories/staff';
import { createSuggestion, listSuggestions } from '../src/server/repositories/suggestions';
import { createUser, findUserByEmail } from '../src/server/repositories/users';
import { upsertSettings } from '../src/server/repositories/settings';
import { hashPassword } from '../src/server/security/password';
import { LIMITS } from '../src/lib/constants';

async function main(): Promise<void> {
  const db = getDb();

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding. See .env.example.');
  }
  if (password.length < LIMITS.passwordMinLength) {
    throw new Error(`SEED_ADMIN_PASSWORD must be at least ${LIMITS.passwordMinLength} characters.`);
  }

  upsertSettings({
    slug: process.env.SEED_STORE_SLUG?.trim() || 'my-store',
    storeName: process.env.SEED_STORE_NAME?.trim() || 'My Store',
    welcomeHeadline: 'How was your visit?',
    welcomeSubline: 'It takes about 20 seconds.',
    thanksHeadline: 'Thank you!',
    thanksSubline: 'Your feedback goes straight to the owner.',
    googleReviewUrl: null,
    googlePlaceId: null,
    askForStaffRating: true,
    askForWishes: true,
    askForComment: true,
    pickupEnabled: false,
    pickupName: 'Pedidos desde el coche',
    pickupTagline: 'Pide sin bajarte del coche.',
    pickupUrl: null,
  });
  console.log('Store settings ready.');

  if (findUserByEmail(email)) {
    console.log(`Administrator ${email} already exists — left untouched.`);
  } else {
    createUser({
      email,
      passwordHash: await hashPassword(password),
      displayName: process.env.SEED_ADMIN_NAME?.trim() || 'Owner',
      role: 'owner',
    });
    console.log(`Administrator ${email} created.`);
  }

  const staffCount = (db.prepare('SELECT COUNT(*) AS c FROM staff').get() as { c: number }).c;
  if (staffCount === 0) {
    for (const [name, accent] of [
      ['Marta', 'indigo'],
      ['Diego', 'emerald'],
      ['Ana', 'amber'],
    ] as const) {
      createStaff({ name, accent, isActive: true });
    }
    console.log('Sample team added.');
  }

  if (listSuggestions(true).length === 0) {
    for (const label of [
      'Oat milk',
      'Gluten-free bread',
      'Larger sizes',
      'Later opening',
      'Card payment at the door',
    ]) {
      createSuggestion({ label, isActive: true });
    }
    console.log('Sample wishlist chips added.');
  }

  console.log('\nDone. Start the app and sign in at /admin/login.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
