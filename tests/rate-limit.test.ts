import assert from 'node:assert/strict';
import test from 'node:test';

import { getDb } from '../src/server/db/client';
import { createStaff } from '../src/server/repositories/staff';
import { issueVisitToken, redeemVisitToken } from '../src/server/repositories/visit-tokens';
import { RULES, consume } from '../src/server/security/rate-limit';

// Opening the connection also runs the migrations against the temporary file
// that tests/setup.ts pointed DATABASE_PATH at.
getDb();

test('a bucket allows exactly its limit, then blocks', () => {
  const rule = { name: 'unit-test', limit: 3, windowSeconds: 60 };

  assert.equal(consume(rule, 'client-a').allowed, true);
  assert.equal(consume(rule, 'client-a').allowed, true);

  const third = consume(rule, 'client-a');
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  assert.equal(consume(rule, 'client-a').allowed, false);
});

test('buckets are isolated per identifier', () => {
  const rule = { name: 'unit-test-isolation', limit: 1, windowSeconds: 60 };

  assert.equal(consume(rule, 'client-x').allowed, true);
  assert.equal(consume(rule, 'client-x').allowed, false);
  // A different client must be unaffected by the first exhausting its budget.
  assert.equal(consume(rule, 'client-y').allowed, true);
});

test('the real rules are namespaced, so they do not share a counter', () => {
  const names = Object.values(RULES).map((rule) => rule.name);
  assert.equal(new Set(names).size, names.length);
});

test('a visit token can be redeemed exactly once', () => {
  const token = issueVisitToken({ staffId: null, source: 'qr', ipHash: null });

  const first = redeemVisitToken(token);
  assert.ok(first, 'the first redemption must succeed');
  assert.equal(first.source, 'qr');

  // This is what stops one scan being replayed into many ratings.
  assert.equal(redeemVisitToken(token), null);
});

test('an unknown or tampered token is refused', () => {
  assert.equal(redeemVisitToken('never-issued-token-value-goes-here'), null);

  const token = issueVisitToken({ staffId: null, source: 'nfc', ipHash: null });
  assert.equal(redeemVisitToken(`${token}x`), null, 'a modified token must not redeem');
  assert.ok(redeemVisitToken(token), 'the unmodified token still works');
});

test('the token carries the staff binding from the tag, not from the client', () => {
  const person = createStaff({ name: 'Marta', accent: 'indigo', isActive: true });
  const token = issueVisitToken({ staffId: person.id, source: 'nfc', ipHash: null });

  const redeemed = redeemVisitToken(token);
  assert.equal(redeemed?.staffId, person.id);
  assert.equal(redeemed?.source, 'nfc');
});

test('a token cannot be bound to a team member who does not exist', () => {
  // The foreign key is the last line of defence behind validation: a tag that
  // names a deleted person must fail loudly rather than store a dangling id.
  assert.throws(() => issueVisitToken({ staffId: 999_999, source: 'qr', ipHash: null }));
});
