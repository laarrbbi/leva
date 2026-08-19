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
import { createCategory, createProduct } from '../src/server/repositories/menu';
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
    pickupEnabled: true,
    pickupName: 'Pedidos desde el coche',
    pickupTagline: 'Pide sin bajarte del coche.',
    pickupUrl: null,
    pickupAcceptingOrders: true,
    pickupPrepMinutes: 5,
    pickupBayCount: 6,
    pickupCurrency: 'EUR',
    pickupClosedMessage:
      'Ahora mismo no estamos aceptando pedidos. Te esperamos en el mostrador.',
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

  // Sample menu for "Pedidos desde el coche", straight from the concept document.
  const categoryCount = (db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }).c;
  if (categoryCount === 0) {
    const menu: Array<[string, Array<[string, string, number, string]>]> = [
      [
        'Pan',
        [
          ['Hogaza de masa madre', 'Fermentación 24 h', 420, '🍞'],
          ['Barra rústica', 'La de todos los días', 140, '🥖'],
          ['Pan integral', 'Con semillas', 260, '🌾'],
        ],
      ],
      [
        'Bollería',
        [
          ['Croissant de mantequilla', 'Hojaldre 48 h', 190, '🥐'],
          ['Napolitana de chocolate', '', 210, '🍫'],
          ['Palmera', '', 180, '🥧'],
        ],
      ],
      [
        'Tartas',
        [
          ['Tarta de queso', 'Entera, 8 raciones', 1800, '🍰'],
          ['Tarta de manzana', 'Entera, 8 raciones', 1600, '🥧'],
        ],
      ],
      [
        'Café',
        [
          ['Café con leche', 'Para llevar', 150, '☕'],
          ['Cortado', 'Para llevar', 130, '☕'],
        ],
      ],
    ];

    for (const [categoryName, items] of menu) {
      const categoryId = createCategory(categoryName);
      for (const [name, description, priceCents, emoji] of items) {
        createProduct({
          categoryId,
          name,
          description,
          priceCents,
          emoji,
          imageUrl: null,
          isActive: true,
        });
      }
    }
    console.log('Sample menu added.');
  }

  console.log('\nDone. Start the app and sign in at /admin/login.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
