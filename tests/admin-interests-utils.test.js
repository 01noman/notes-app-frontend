import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminInterestsRequest,
  getAdminInterestsErrorMessage,
  isAdminInterestsRetryableError,
  normalizeAdminInterestsResponse,
  resolveAdminInterestsPage,
} from '../src/admin-interests/adminInterestsUtils.js';

const validPayload = {
  data: [
    { interest: 'chess', count: 2, users: [
      { _id: '64f000000000000000000001', name: 'Ada', email: 'ada@example.com', role: 'admin' },
      { _id: '64f000000000000000000002', name: 'Ben', email: 'ben@example.com', passwordHash: 'never render' },
    ] },
    { interest: 'reading', count: 1, users: [
      { _id: '64f000000000000000000003', name: 'Chandra', email: 'chandra@example.com' },
    ] },
  ],
  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
};

test('normalizes interest groups and only the documented user fields', () => {
  const result = normalizeAdminInterestsResponse(validPayload);
  assert.deepEqual(result.interests, [
    { interest: 'chess', count: 2, users: [
      { _id: '64f000000000000000000001', name: 'Ada', email: 'ada@example.com' },
      { _id: '64f000000000000000000002', name: 'Ben', email: 'ben@example.com' },
    ] },
    { interest: 'reading', count: 1, users: [
      { _id: '64f000000000000000000003', name: 'Chandra', email: 'chandra@example.com' },
    ] },
  ]);
  assert.deepEqual(result.pagination, validPayload.pagination);
});

test('rejects malformed envelopes and inconsistent pagination', () => {
  assert.throws(() => normalizeAdminInterestsResponse(null), /invalid grouped interests response/i);
  assert.throws(() => normalizeAdminInterestsResponse({ ...validPayload, data: {} }), /invalid grouped interests response/i);
  assert.throws(() => normalizeAdminInterestsResponse({ ...validPayload, pagination: { ...validPayload.pagination, totalPages: 4 } }), /invalid grouped interests response/i);
});

test('rejects malformed groups, duplicate group names, and inconsistent counts', () => {
  for (const mutate of [
    (payload) => { payload.data[0].interest = 'Chess'; },
    (payload) => { payload.data[0].count = 3; },
    (payload) => { payload.data[0].users[0]._id = 'bad-id'; },
    (payload) => { payload.data[0].users[0].email = ''; },
  ]) {
    const payload = structuredClone(validPayload);
    mutate(payload);
    assert.throws(() => normalizeAdminInterestsResponse(payload), /invalid grouped interests response/i);
  }

  const duplicate = structuredClone(validPayload);
  duplicate.data[1].interest = 'chess';
  assert.throws(() => normalizeAdminInterestsResponse(duplicate), /invalid grouped interests response/i);
});

test('builds a bounded paginated grouped-interest request', () => {
  assert.equal(buildAdminInterestsRequest(2, 25), 'users/grouped-by-interests?page=2&limit=25');
  assert.throws(() => buildAdminInterestsRequest(0, 10), /page/i);
  assert.throws(() => buildAdminInterestsRequest(1, 51), /limit/i);
});

test('clamps an out-of-range page to the last available group page', () => {
  assert.equal(resolveAdminInterestsPage(4, { totalPages: 2 }), 2);
  assert.equal(resolveAdminInterestsPage(2, { totalPages: 0 }), 1);
  assert.equal(resolveAdminInterestsPage(0, { totalPages: 5 }), 1);
});

test('maps grouped-interest errors to safe admin-facing messages', () => {
  assert.equal(getAdminInterestsErrorMessage({ status: 403 }), "You don't have access to this page.");
  assert.match(getAdminInterestsErrorMessage({ status: 400 }), /pagination/i);
  assert.match(getAdminInterestsErrorMessage({ status: 401 }), /session/i);
  assert.match(getAdminInterestsErrorMessage({ status: 429 }), /too many/i);
  assert.match(getAdminInterestsErrorMessage({ status: 503, message: 'secret' }), /server could not complete/i);
  assert.match(getAdminInterestsErrorMessage({ status: 422, message: { raw: 'secret' } }), /could not load grouped interests/i);
});

test('only network, timeout, and server errors are retryable', () => {
  assert.equal(isAdminInterestsRetryableError({ status: 0, code: 'NETWORK_ERROR' }), true);
  assert.equal(isAdminInterestsRetryableError({ timedOut: true }), true);
  assert.equal(isAdminInterestsRetryableError({ status: 500 }), true);
  assert.equal(isAdminInterestsRetryableError({ status: 400 }), false);
  assert.equal(isAdminInterestsRetryableError({ status: 403 }), false);
});
