/**
 * Test bootstrap, loaded via `node --import` before any test file.
 *
 * The database module resolves its path the first time it is imported, so the
 * environment has to be in place before a test file's import graph is walked —
 * which is why this lives here rather than at the top of a test.
 *
 * Node also runs with `--conditions=react-server` (see package.json) so that
 * `server-only` resolves to its empty stub instead of the module that throws
 * outside a React Server Component.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leva-test-'));

// NODE_ENV is intentionally left alone: Next's types declare it read-only, and
// the env loader already treats anything other than 'production' as permissive.
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-ok';
process.env.IP_HASH_SECRET = 'test-ip-hash-secret-that-is-long-enough-ok';
process.env.APP_ORIGIN = 'https://test.local';

process.on('exit', () => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
