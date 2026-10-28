import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPublicPostsRequest,
  getPublicPostsErrorMessage,
  isRetryablePublicPostsError,
  normalizePublicPostsResponse,
  resolvePublicPostsPage,
} from '../src/public-posts/publicPostsUtils.js';

const validPayload = {
  data: {
    user: {
      _id: '64f000000000000000000001',
      name: 'Ada Lovelace',
      email: 'private@example.com',
      role: 'admin',
    },
    posts: [{
      _id: '64f000000000000000000002',
      title: 'A public note',
      body: 'Visible to everyone.',
      createdAt: '2026-10-29T00:00:00.000Z',
      author: 'private-author-field',
    }],
  },
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

test('normalizes public user and post fields without copying private fields', () => {
  const result = normalizePublicPostsResponse(validPayload, '64f000000000000000000001');

  assert.deepEqual(result.user, { _id: '64f000000000000000000001', name: 'Ada Lovelace' });
  assert.deepEqual(result.posts, [{
    _id: '64f000000000000000000002',
    title: 'A public note',
    body: 'Visible to everyone.',
    createdAt: '2026-10-29T00:00:00.000Z',
  }]);
  assert.deepEqual(result.pagination, validPayload.pagination);
});

test('rejects invalid public-post envelopes and missing public user data', () => {
  assert.throws(() => normalizePublicPostsResponse(null, '64f000000000000000000001'), /invalid public posts response/i);
  assert.throws(() => normalizePublicPostsResponse({ ...validPayload, data: { posts: [] } }, '64f000000000000000000001'), /invalid public posts response/i);
});

test('rejects a response whose public user does not match the requested id', () => {
  assert.throws(() => normalizePublicPostsResponse(validPayload, '64f000000000000000000009'), /invalid public posts response/i);
});

test('rejects malformed posts and invalid creation dates', () => {
  const missingBody = structuredClone(validPayload);
  delete missingBody.data.posts[0].body;
  assert.throws(() => normalizePublicPostsResponse(missingBody, '64f000000000000000000001'), /invalid public posts response/i);

  const invalidDate = structuredClone(validPayload);
  invalidDate.data.posts[0].createdAt = 'not-a-date';
  assert.throws(() => normalizePublicPostsResponse(invalidDate, '64f000000000000000000001'), /invalid public posts response/i);
});

test('rejects inconsistent pagination and result counts', () => {
  const invalidPagination = structuredClone(validPayload);
  invalidPagination.pagination.totalPages = 2;
  assert.throws(() => normalizePublicPostsResponse(invalidPagination, '64f000000000000000000001'), /invalid public posts response/i);

  const invalidCount = structuredClone(validPayload);
  invalidCount.pagination.limit = 1;
  invalidCount.data.posts.push({ ...validPayload.data.posts[0], _id: 'post-2' });
  invalidCount.pagination.total = 2;
  invalidCount.pagination.totalPages = 2;
  assert.throws(() => normalizePublicPostsResponse(invalidCount, '64f000000000000000000001'), /invalid public posts response/i);
});

test('clamps requested pages to the last valid public-post page', () => {
  assert.equal(resolvePublicPostsPage(4, { totalPages: 2 }), 2);
  assert.equal(resolvePublicPostsPage(2, { totalPages: 0 }), 1);
  assert.equal(resolvePublicPostsPage(0, { totalPages: 5 }), 1);
});

test('maps public-post failures to safe contextual messages', () => {
  assert.equal(getPublicPostsErrorMessage({ status: 400 }), 'User not found.');
  assert.equal(getPublicPostsErrorMessage({ status: 404 }), 'User not found.');
  assert.equal(getPublicPostsErrorMessage({ status: 0, code: 'NETWORK_ERROR' }), 'Cannot reach server. It may be waking up (up to 60 seconds); please retry.');
  assert.equal(getPublicPostsErrorMessage({ status: 429 }), 'Too many requests. Please wait a moment.');
  assert.equal(getPublicPostsErrorMessage({ status: 503, message: 'secret stack trace' }), 'The server could not complete the request. Please try again.');
  assert.equal(getPublicPostsErrorMessage({ message: { stack: 'secret' } }), 'Something went wrong. Please try again.');
});

test('only network, timeout and server failures are retryable', () => {
  assert.equal(isRetryablePublicPostsError({ status: 0, code: 'NETWORK_ERROR' }), true);
  assert.equal(isRetryablePublicPostsError({ timedOut: true }), true);
  assert.equal(isRetryablePublicPostsError({ status: 503 }), true);
  assert.equal(isRetryablePublicPostsError({ status: 400 }), false);
  assert.equal(isRetryablePublicPostsError({ status: 429 }), false);
});

test('builds paginated public requests that explicitly disable authorization', () => {
  assert.deepEqual(buildPublicPostsRequest('64f000000000000000000001', 2, 25), {
    path: 'users/64f000000000000000000001/posts?page=2&limit=25',
    options: { auth: false },
  });

  assert.deepEqual(buildPublicPostsRequest('64f000000000000000000001', 0, 999), {
    path: 'users/64f000000000000000000001/posts?page=1&limit=10',
    options: { auth: false },
  });
});
