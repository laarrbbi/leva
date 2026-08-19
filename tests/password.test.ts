import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPassword, needsRehash, verifyPassword } from '../src/server/security/password';

test('a correct password verifies', async () => {
  const encoded = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple', encoded), true);
});

test('a wrong password does not verify', async () => {
  const encoded = await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery stapl', encoded), false);
});

test('the same password hashes differently every time', async () => {
  const [a, b] = await Promise.all([hashPassword('same input'), hashPassword('same input')]);
  assert.notEqual(a, b, 'salts must be unique per hash');
});

test('unicode passwords are normalised, so identical text always matches', async () => {
  // Composed U+00E9 versus decomposed e + U+0301: visually identical, different
  // bytes. Without NFKC the user could not log in from a different keyboard.
  const composed = 'caf\u00E9-passphrase';
  const decomposed = 'cafe\u0301-passphrase';
  const encoded = await hashPassword(composed);
  assert.equal(await verifyPassword(decomposed, encoded), true);
});

test('a malformed stored hash is rejected rather than throwing', async () => {
  for (const bad of ['', 'not-a-hash', 'scrypt$1$2$3', 'bcrypt$1$2$3$4$5', 'scrypt$x$y$z$a$b']) {
    assert.equal(await verifyPassword('anything', bad), false, bad);
  }
});

test('weaker parameters are flagged for rehash', async () => {
  const current = await hashPassword('whatever');
  assert.equal(needsRehash(current), false);
  assert.equal(needsRehash('scrypt$1024$8$1$c2FsdA==$aGFzaA=='), true);
  assert.equal(needsRehash('garbage'), true);
});
