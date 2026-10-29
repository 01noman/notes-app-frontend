import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { API_BASE_URL, clearStoredToken, readStoredToken, storeToken, TOKEN_STORAGE_KEY, wakeServer } from '../src/api/client.js';
import { authReducer, classifyVerificationError, createInitialAuthState, getGuardDecision } from '../src/auth/session.js';
import { getAdminInterestsErrorMessage, isAdminInterestsRetryableError } from '../src/admin-interests/adminInterestsUtils.js';
import { getAdminNotesErrorMessage, isAdminNotesRetryableError } from '../src/admin-notes/adminNotesUtils.js';
import { getAdminUsersErrorMessage, isAdminUsersRetryableError } from '../src/admin-users/adminUsersUtils.js';

const user = { _id: 'user-1', name: 'Ada', email: 'ada@example.com', role: 'user' };

// ---- boot verification keeps the session when the server is merely unreachable ----

test('an unreachable server during boot verification keeps the user out of "anonymous" so the token survives', () => {
  const verifying = createInitialAuthState(true);
  assert.deepEqual(authReducer(verifying, { type: 'SESSION_UNAVAILABLE' }), { status: 'unavailable', user: null, notice: null });
});

test('SESSION_UNAVAILABLE and VERIFY_RETRY only apply in the states they belong to', () => {
  const authenticated = { status: 'authenticated', user, notice: null };
  assert.equal(authReducer(authenticated, { type: 'SESSION_UNAVAILABLE' }), authenticated);
  assert.equal(authReducer(authenticated, { type: 'VERIFY_RETRY' }), authenticated);

  const unavailable = { status: 'unavailable', user: null, notice: null };
  assert.deepEqual(authReducer(unavailable, { type: 'VERIFY_RETRY' }), { status: 'verifying', user: null, notice: null });
});

test('route guards show the loading state while the session is unavailable instead of redirecting to login', () => {
  for (const mode of ['auth', 'admin', 'anonymous']) {
    assert.deepEqual(getGuardDecision({ status: 'unavailable', user: null, mode }), { type: 'loading' });
  }
});

test('verification failures are classified: only network/5xx keep the token', () => {
  assert.equal(classifyVerificationError({ status: 401 }), 'unauthorized');
  assert.equal(classifyVerificationError({ status: 0, code: 'NETWORK_ERROR' }), 'unavailable');
  assert.equal(classifyVerificationError({ status: 0, timedOut: true }), 'unavailable');
  assert.equal(classifyVerificationError({ status: 503 }), 'unavailable');
  assert.equal(classifyVerificationError({ status: 403 }), 'invalid');
  assert.equal(classifyVerificationError(new Error('The server returned an invalid session response.')), 'invalid');
  assert.equal(classifyVerificationError(undefined), 'invalid');
});

// ---- shared token helpers and the server wake-up request ----

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: new MemoryStorage() });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

test('token helpers store, read and clear the session token under the documented key', () => {
  assert.equal(readStoredToken(), null);
  storeToken('abc.def.ghi');
  assert.equal(globalThis.localStorage.getItem(TOKEN_STORAGE_KEY), 'abc.def.ghi');
  assert.equal(readStoredToken(), 'abc.def.ghi');
  clearStoredToken();
  assert.equal(readStoredToken(), null);
});

test('storeToken fails with a safe message when the browser blocks storage', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { setItem() { throw new Error('QuotaExceededError: private detail'); }, getItem: () => null, removeItem() {} },
  });
  assert.throws(() => storeToken('x'), (error) => {
    assert.match(error.message, /could not save your session/i);
    assert.doesNotMatch(error.message, /Quota|private/);
    return true;
  });
});

test('wakeServer sends one unauthenticated GET to /health and never throws', async () => {
  storeToken('should-not-be-sent');
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response('{}'); };

  wakeServer();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_BASE_URL}/health`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers, undefined);
});

test('wakeServer swallows network failures and a missing fetch', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  assert.doesNotThrow(() => wakeServer());
  await new Promise((resolve) => setImmediate(resolve));

  globalThis.fetch = undefined;
  assert.doesNotThrow(() => wakeServer());
});

// ---- admin pages: a malformed reply is not a network error ----

test('a malformed server reply is not reported as "Cannot reach server" and is not retryable', () => {
  const malformed = new TypeError('Invalid admin notes response.');

  assert.doesNotMatch(getAdminUsersErrorMessage(malformed, 'load'), /Cannot reach server/);
  assert.doesNotMatch(getAdminNotesErrorMessage(malformed), /Cannot reach server/);
  assert.doesNotMatch(getAdminInterestsErrorMessage(malformed), /Cannot reach server/);

  assert.equal(isAdminUsersRetryableError(malformed), false);
  assert.equal(isAdminNotesRetryableError(malformed), false);
  assert.equal(isAdminInterestsRetryableError(malformed), false);
});

test('real network failures are still reported as unreachable and retryable on every admin page', () => {
  const network = { status: 0, code: 'NETWORK_ERROR' };
  assert.match(getAdminUsersErrorMessage(network, 'load'), /Cannot reach server/);
  assert.match(getAdminNotesErrorMessage(network), /Cannot reach server/);
  assert.match(getAdminInterestsErrorMessage(network), /Cannot reach server/);
  assert.equal(isAdminUsersRetryableError(network), true);
  assert.equal(isAdminNotesRetryableError({ code: 'NETWORK_ERROR' }), true);
  assert.equal(isAdminInterestsRetryableError({ status: 503 }), true);
});
