import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { env } from '@/lib/env';

import { MIGRATIONS } from './migrations';

export type Db = Database.Database;

/**
 * Next.js re-evaluates modules on every hot reload in development. Parking the
 * handle on `globalThis` keeps a single connection (and therefore a single
 * write lock) alive across reloads.
 */
const globalForDb = globalThis as unknown as { __levaDb?: Db };

function openDatabase(): Db {
  // `turbopackIgnore` keeps the bundler from tracing this dynamic path and
  // pulling the entire source tree (and `public/`) into the standalone output.
  // The path is operator-configured, never request-derived.
  const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATABASE_PATH);
  fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(file), { recursive: true });

  const db = new Database(file);

  // WAL lets readers proceed during a write — the kiosk stays responsive while
  // the admin dashboard is being used.
  db.pragma('journal_mode = WAL');
  // Durability without an fsync per statement; safe against process crashes.
  db.pragma('synchronous = NORMAL');
  // ON DELETE clauses in the schema are inert unless this is on. SQLite
  // defaults it to OFF for backwards compatibility.
  db.pragma('foreign_keys = ON');
  // Fail fast rather than hanging forever if another writer holds the lock.
  db.pragma('busy_timeout = 5000');

  migrate(db);
  return db;
}

/** Applies any migration that has not been recorded yet, each in its own transaction. */
export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r) => (r as { id: number }).id),
  );

  const record = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.id, migration.name);
    })();
  }
}

export function getDb(): Db {
  globalForDb.__levaDb ??= openDatabase();
  return globalForDb.__levaDb;
}
