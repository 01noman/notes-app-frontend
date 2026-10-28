import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProfileErrorMessage,
  isProfileRetryableError,
  mapProfileValidationDetails,
  normalizeMyPostsResponse,
  parseProfileInterests,
  resolveProfilePostsPage,
  validatePostForm,
  validateProfileForm,
} from '../src/profile/profileUtils.js';

test('profile interests are trimmed, lowercased, and de-duplicated', () => {
  assert.deepEqual(parseProfileInterests(' Chess, reading,CHESS,, Music , '), ['chess', 'reading', 'music']);
  assert.deepEqual(parseProfileInterests(' , '), []);
});

test('profile validation requires a name and enforces name and interest limits', () => {
  assert.deepEqual(validateProfileForm({ name: ' Ada ', interests: 'Chess, reading' }), {});
  assert.deepEqual(validateProfileForm({ name: ' ', interests: '' }), { name: 'Name is required.' });
  assert.equal(validateProfileForm({ name: 'x'.repeat(81), interests: '' }).name, 'Name must be at most 80 characters.');
  assert.equal(validateProfileForm({ name: 'Ada', interests: Array.from({ length: 11 }, (_, index) => `i${index}`).join(',') }).interests,
    'Enter no more than 10 interests.');
  assert.equal(validateProfileForm({ name: 'Ada', interests: 'x'.repeat(31) }).interests,
    'Each interest must be at most 30 characters.');
});

test('post validation requires title/body and enforces API length limits', () => {
  assert.deepEqual(validatePostForm({ title: 'First post', body: 'A public post.\nWith a second line.' }), {});
  assert.deepEqual(validatePostForm({ title: ' ', body: '  ' }), {
    title: 'Title is required.',
    body: 'Body is required.',
  });
  assert.equal(validatePostForm({ title: 'x'.repeat(121), body: 'ok' }).title, 'Title must be at most 120 characters.');
  assert.equal(validatePostForm({ title: 'ok', body: 'x'.repeat(5001) }).body, 'Body must be at most 5000 characters.');
});

test('my-posts response normalization accepts the documented envelope', () => {
  const response = {
    data: { posts: [{ _id: 'p1', title: 'Hello', body: 'World', createdAt: '2026-10-29T00:00:00.000Z' }] },
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  };
  assert.deepEqual(normalizeMyPostsResponse(response), { posts: response.data.posts, pagination: response.pagination });
});

test('my-posts response normalization rejects malformed envelopes and invalid posts', () => {
  assert.throws(() => normalizeMyPostsResponse(null), /invalid posts response/i);
  assert.throws(() => normalizeMyPostsResponse({ data: { posts: [] }, pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } }),
    /invalid posts response/i);
  assert.throws(() => normalizeMyPostsResponse({
    data: { posts: [{ _id: 'p1', title: 'Missing body', createdAt: '2026-10-29T00:00:00.000Z' }] },
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  }), /invalid posts response/i);
});

test('page resolution falls back to the last valid page when needed', () => {
  assert.equal(resolveProfilePostsPage(3, { totalPages: 2 }), 2);
  assert.equal(resolveProfilePostsPage(2, { totalPages: 0 }), 1);
  assert.equal(resolveProfilePostsPage(0, { totalPages: 4 }), 1);
});

test('only network and server failures expose a retry action', () => {
  assert.equal(isProfileRetryableError({ status: 0, code: 'NETWORK_ERROR' }), true);
  assert.equal(isProfileRetryableError({ status: 503 }), true);
  assert.equal(isProfileRetryableError({ status: 400 }), false);
  assert.equal(isProfileRetryableError({ status: 429 }), false);
});

test('profile errors use safe, contextual messages and never render raw objects', () => {
  assert.equal(getProfileErrorMessage({ status: 0 }, 'load'), 'Cannot reach server.');
  assert.equal(getProfileErrorMessage({ status: 404 }, 'posts'), 'Your public profile could not be found.');
  assert.equal(getProfileErrorMessage({ status: 429 }), 'Too many requests. Please wait a moment.');
  assert.equal(getProfileErrorMessage({ status: 503, message: 'private stack' }),
    'The server could not complete the request. Please try again.');
  assert.equal(getProfileErrorMessage({ message: { stack: 'private stack' } }), 'Something went wrong. Please try again.');
});

test('profile API validation details map only to fields known by the current form', () => {
  assert.deepEqual(mapProfileValidationDetails([
    { field: 'name', message: 'Name is required' },
    { field: 'interests.0', message: 'Interest cannot be empty' },
    { field: 'role', message: 'Unknown field' },
  ], ['name', 'interests']), {
    fieldErrors: { name: 'Name is required', interests: 'Interest cannot be empty' },
    formError: 'Invalid input. Please check the fields.',
  });
});
