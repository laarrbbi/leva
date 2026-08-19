/**
 * Applies pending migrations, then exits.
 *
 * Run it in a deployment's release phase, before the new server starts, so the
 * schema is never behind the code that queries it.
 */
import { getDb } from '../src/server/db/client';

getDb();
console.log('Migrations applied.');
