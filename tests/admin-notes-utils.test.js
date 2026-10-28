import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminNotesRequest,
  getAdminNotesErrorMessage,
  isAdminNotesRetryableError,
  normalizeAdminNotesResponse,
  resolveAdminNotesPage,
  validateAdminOwnerFilter,
} from '../src/admin-notes/adminNotesUtils.js';

const ownerId = '64f000000000000000000001';
const noteId = '64f000000000000000000002';
const validPayload = {
  data: [{
    _id: noteId,
    title: 'Release planning',
    owner: ownerId,
    content: 'This content is not needed on the admin read-only list.',
    passwordHash: 'never render this',
    updatedAt: '2026-10-28T12:30:00.000Z',
  }],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

test('normalizes admin notes and projects only title, owner id, and updated date', () => {
  const result = normalizeAdminNotesResponse(validPayload);
  assert.deepEqual(result.notes, [{
    _id: noteId,
    title: 'Release planning',
    owner: ownerId,
    updatedAt: '2026-10-28T12:30:00.000Z',
  }]);
  assert.deepEqual(result.pagination, validPayload.pagination);
});

test('rejects malformed envelopes and inconsistent pagination', () => {
  assert.throws(() => normalizeAdminNotesResponse(null), /invalid admin notes response/i);
  assert.throws(() => normalizeAdminNotesResponse({ ...validPayload, data: {} }), /invalid admin notes response/i);
  assert.throws(() => normalizeAdminNotesResponse({ ...validPayload, pagination: { ...validPayload.pagination, totalPages: 2 } }), /invalid admin notes response/i);
  assert.throws(() => normalizeAdminNotesResponse({ ...validPayload, pagination: { ...validPayload.pagination, limit: 11 } }), /invalid admin notes response/i);
});

test('rejects note rows with malformed identifiers, titles, owners, or dates', () => {
  for (const changes of [
    { _id: 'not-an-id' },
    { title: '  ' },
    { owner: 'not-an-owner-id' },
    { updatedAt: 'not-a-date' },
  ]) {
    const payload = structuredClone(validPayload);
    Object.assign(payload.data[0], changes);
    assert.throws(() => normalizeAdminNotesResponse(payload), /invalid admin notes response/i);
  }
});

test('validates an optional owner filter as a MongoDB ObjectId', () => {
  assert.equal(validateAdminOwnerFilter(''), null);
  assert.equal(validateAdminOwnerFilter(` ${ownerId} `), null);
  assert.match(validateAdminOwnerFilter('123'), /24-character/i);
});

test('builds paginated admin notes requests with an optional normalized owner filter', () => {
  assert.equal(buildAdminNotesRequest(2, 25), 'notes/all?page=2&limit=25');
  assert.equal(buildAdminNotesRequest(1, 10, ownerId.toUpperCase()), `notes/all?page=1&limit=10&ownerId=${ownerId}`);
  assert.throws(() => buildAdminNotesRequest(0, 10), /page/i);
  assert.throws(() => buildAdminNotesRequest(1, 51), /limit/i);
  assert.throws(() => buildAdminNotesRequest(1, 10, 'bad-id'), /ownerId/i);
});

test('clamps an out-of-range page to the last available page', () => {
  assert.equal(resolveAdminNotesPage(9, { totalPages: 3 }), 3);
  assert.equal(resolveAdminNotesPage(2, { totalPages: 0 }), 1);
  assert.equal(resolveAdminNotesPage(0, { totalPages: 4 }), 1);
});

test('maps admin notes errors to safe contextual messages', () => {
  assert.equal(getAdminNotesErrorMessage({ status: 403 }), "You don't have access to this page.");
  assert.match(getAdminNotesErrorMessage({ status: 400 }), /owner ID/i);
  assert.match(getAdminNotesErrorMessage({ status: 401 }), /session/i);
  assert.match(getAdminNotesErrorMessage({ status: 429 }), /too many/i);
  assert.match(getAdminNotesErrorMessage({ status: 503, message: 'private stack' }), /server could not complete/i);
  assert.match(getAdminNotesErrorMessage({ status: 422, message: { raw: 'secret' } }), /could not load notes/i);
});

test('only network, timeout, and server errors are retryable', () => {
  assert.equal(isAdminNotesRetryableError({ status: 0, code: 'NETWORK_ERROR' }), true);
  assert.equal(isAdminNotesRetryableError({ timedOut: true }), true);
  assert.equal(isAdminNotesRetryableError({ status: 500 }), true);
  assert.equal(isAdminNotesRetryableError({ status: 400 }), false);
  assert.equal(isAdminNotesRetryableError({ status: 403 }), false);
});
