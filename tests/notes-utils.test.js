import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getNotesErrorMessage,
  isRetryableNotesError,
  mapNoteValidationDetails,
  normalizeNotesResponse,
  resolveNotesPage,
  validateNoteForm,
} from '../src/notes/notesUtils.js';

test('note validation requires a title and content and enforces API length limits', () => {
  assert.deepEqual(validateNoteForm({ title: ' Shopping ', content: 'Buy milk' }), {});
  assert.deepEqual(validateNoteForm({ title: '  ', content: '  ' }), {
    title: 'Title is required.',
    content: 'Content is required.',
  });
  assert.equal(validateNoteForm({ title: 'x'.repeat(121), content: 'valid' }).title,
    'Title must be at most 120 characters.');
  assert.equal(validateNoteForm({ title: 'valid', content: 'x'.repeat(10001) }).content,
    'Content must be at most 10000 characters.');
});

test('notes response normalization accepts the documented list envelope', () => {
  const response = normalizeNotesResponse({
    data: [{ _id: 'abc12345', title: 'First', content: 'Body', updatedAt: '2026-10-29T00:00:00.000Z' }],
    pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
  });

  assert.equal(response.notes.length, 1);
  assert.equal(response.pagination.page, 2);
  assert.equal(response.pagination.totalPages, 2);
});

test('notes response normalization rejects malformed response data safely', () => {
  assert.throws(() => normalizeNotesResponse({ data: {}, pagination: {} }), /invalid notes response/i);
  assert.throws(() => normalizeNotesResponse({ data: [{}], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } }),
    /invalid notes response/i);
});

test('page clamp returns to the last valid page after deleting the last item on the last page', () => {
  // 12 notes at 10 per page means page 2; after the last two are deleted totalPages becomes 1.
  assert.equal(resolveNotesPage(2, { totalPages: 1 }), 1);
  assert.equal(resolveNotesPage(2, { totalPages: 0 }), 1);
  assert.equal(resolveNotesPage(1, { totalPages: 2 }), 1);
  assert.equal(resolveNotesPage(9, { totalPages: 3 }), 3);
});

test('note error messages are safe and map common API failures', () => {
  assert.equal(getNotesErrorMessage({ status: 404 }, 'update'), 'Note no longer exists.');
  assert.equal(getNotesErrorMessage({ status: 400 }, 'create'), 'Invalid input. Please check the fields.');
  assert.equal(getNotesErrorMessage({ status: 403 }, 'load'), "You don't have access to this resource.");
  assert.match(getNotesErrorMessage({ status: 0, code: 'NETWORK_ERROR' }, 'load'), /Cannot reach server/);
  assert.match(getNotesErrorMessage({ status: 503, message: 'private stack' }, 'load'), /server could not complete/i);
  assert.doesNotMatch(getNotesErrorMessage({ status: 503, message: 'private stack' }, 'load'), /private stack/);
});

test('note API validation details map only title/content and flag unknown fields', () => {
  assert.deepEqual(mapNoteValidationDetails([
    { field: 'title', message: 'Title is required' },
    { field: 'content', message: 'Content is required' },
    { field: 'role', message: 'Unknown field' },
  ]), {
    fieldErrors: { title: 'Title is required', content: 'Content is required' },
    formError: 'Invalid input. Please check the fields.',
  });
});

test('only network, timeout and server failures expose a retry affordance', () => {
  assert.equal(isRetryableNotesError({ status: 0 }), true);
  assert.equal(isRetryableNotesError({ status: 503 }), true);
  assert.equal(isRetryableNotesError({ timedOut: true }), true);
  assert.equal(isRetryableNotesError({ status: 400 }), false);
  assert.equal(isRetryableNotesError({ status: 404 }), false);
});
