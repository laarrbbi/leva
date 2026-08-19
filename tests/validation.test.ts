import assert from 'node:assert/strict';
import test from 'node:test';

import {
  feedbackInputSchema,
  googleReviewUrlSchema,
  platformUrlSchema,
  settingsSchema,
} from '../src/server/validation/schemas';

const validSettings = {
  slug: 'my-store',
  storeName: 'My Store',
  welcomeHeadline: 'How was your visit?',
  welcomeSubline: '',
  thanksHeadline: 'Thank you',
  thanksSubline: '',
  googleReviewUrl: '',
  googlePlaceId: '',
  askForStaffRating: 'true',
  askForWishes: 'true',
  askForComment: 'true',
  pickupEnabled: 'true',
  pickupName: 'Pedidos desde el coche',
  pickupTagline: '',
  pickupUrl: '',
};

test('an unchecked checkbox stays false', () => {
  // The bug this guards: `Boolean("false")` is true, so a naive coercion turns
  // every toggle the owner switched off back on the moment they save.
  const parsed = settingsSchema.parse({ ...validSettings, askForWishes: 'false' });
  assert.equal(parsed.askForWishes, false);
  assert.equal(parsed.askForStaffRating, true);
});

test('an absent checkbox is false, not undefined', () => {
  const parsed = settingsSchema.parse({ ...validSettings, askForComment: null });
  assert.equal(parsed.askForComment, false);
});

test('only Google hosts are accepted as review links', () => {
  for (const good of [
    '',
    'https://g.page/r/abc123/review',
    'https://search.google.com/local/writereview?placeid=x',
    'https://maps.app.goo.gl/abc',
  ]) {
    assert.equal(googleReviewUrlSchema.safeParse(good).success, true, good);
  }

  for (const bad of [
    'https://evil.example.com/review',
    'http://g.page/r/abc/review',
    'javascript:alert(1)',
    // A lookalike host: the allowlist must match the whole hostname, not a suffix.
    'https://g.page.evil.com/r/abc',
    'not a url',
  ]) {
    assert.equal(googleReviewUrlSchema.safeParse(bad).success, false, bad);
  }
});

test('the second-platform link must be https', () => {
  assert.equal(platformUrlSchema.safeParse('https://pedidos.example.com').success, true);
  assert.equal(platformUrlSchema.safeParse('').success, true);

  for (const bad of [
    'http://pedidos.example.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com',
  ]) {
    assert.equal(platformUrlSchema.safeParse(bad).success, false, bad);
  }
});

test('control characters are stripped from free text', () => {
  const parsed = feedbackInputSchema.parse({
    visitToken: 'x'.repeat(32),
    storeRating: 5,
    comment: 'good bread\u0007here \u001F',
  });
  assert.equal(parsed.comment, 'good bread here');
});

test('ratings outside 1-5 are rejected', () => {
  for (const rating of [0, 6, -1, 2.5]) {
    const result = feedbackInputSchema.safeParse({
      visitToken: 'x'.repeat(32),
      storeRating: rating,
    });
    assert.equal(result.success, false, String(rating));
  }
});

test('the wish list is capped', () => {
  const result = feedbackInputSchema.safeParse({
    visitToken: 'x'.repeat(32),
    storeRating: 4,
    suggestionIds: [1, 2, 3, 4, 5, 6],
  });
  assert.equal(result.success, false);
});

test('a slug cannot contain path traversal or spaces', () => {
  for (const bad of ['../etc', 'My Store', 'a/b', '-leading', 'trailing-', '']) {
    assert.equal(settingsSchema.safeParse({ ...validSettings, slug: bad }).success, false, bad);
  }
});

test('an over-long comment is rejected rather than silently truncated', () => {
  const result = feedbackInputSchema.safeParse({
    visitToken: 'x'.repeat(32),
    storeRating: 3,
    comment: 'a'.repeat(501),
  });
  assert.equal(result.success, false);
});
