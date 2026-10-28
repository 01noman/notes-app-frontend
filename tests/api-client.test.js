import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { apiRequest, ApiError, setUnauthorizedHandler, TOKEN_STORAGE_KEY } from '../src/api/client.js';

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

const originalFetch = globalThis.fetch;
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let storage;
let unregisterUnauthorizedHandler;

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: storage,
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorageDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
  unregisterUnauthorizedHandler?.();
  unregisterUnauthorizedHandler = undefined;
});

test('uses VITE_API_URL base and attaches the stored Bearer token to protected requests', async () => {
  storage.setItem(TOKEN_STORAGE_KEY, 'test.jwt.token');
  let capturedUrl;
  let capturedOptions;
  globalThis.fetch = async (url, options) => {
    capturedUrl = String(url);
    capturedOptions = options;
    return new Response(JSON.stringify({ data: { user: { name: 'Ada' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await apiRequest('/users/me');

  assert.equal(capturedUrl, 'http://localhost:4000/api/v1/users/me');
  assert.equal(capturedOptions.headers.get('Authorization'), 'Bearer test.jwt.token');
  assert.equal(capturedOptions.headers.get('Accept'), 'application/json');
  assert.deepEqual(result, { data: { user: { name: 'Ada' } } });
});

test('serializes JSON request bodies and sets the JSON content type', async () => {
  let capturedOptions;
  globalThis.fetch = async (_url, options) => {
    capturedOptions = options;
    return new Response(JSON.stringify({ data: { user: {}, token: 'jwt' } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };

  await apiRequest('/auth/login', { method: 'POST', body: { email: 'ada@example.com', password: 'secret' } });

  assert.equal(capturedOptions.headers.get('Content-Type'), 'application/json');
  assert.equal(capturedOptions.body, JSON.stringify({ email: 'ada@example.com', password: 'secret' }));
  assert.equal(capturedOptions.headers.has('Authorization'), false);
});

test('turns the API error envelope into ApiError without exposing raw response data', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: [{ field: 'email', message: 'Invalid email' }],
    },
  }), { status: 400, headers: { 'content-type': 'application/json' } });

  await assert.rejects(apiRequest('/auth/register', { method: 'POST', body: {} }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.message, 'Invalid input');
    assert.deepEqual(error.details, [{ field: 'email', message: 'Invalid email' }]);
    assert.equal(error.message.includes('passwordHash'), false);
    return true;
  });
});

test('clears the token and invokes the central handler for non-login 401 responses', async () => {
  storage.setItem(TOKEN_STORAGE_KEY, 'expired.jwt');
  let handlerCalls = 0;
  unregisterUnauthorizedHandler = setUnauthorizedHandler(() => { handlerCalls += 1; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' },
  }), { status: 401, headers: { 'content-type': 'application/json' } });

  await assert.rejects(apiRequest('/users/me'), (error) => error.status === 401);

  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), null);
  assert.equal(handlerCalls, 1);
});

test('does not clear an existing token or invoke the central handler for login 401', async () => {
  storage.setItem(TOKEN_STORAGE_KEY, 'existing.jwt');
  let handlerCalls = 0;
  unregisterUnauthorizedHandler = setUnauthorizedHandler(() => { handlerCalls += 1; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' },
  }), { status: 401, headers: { 'content-type': 'application/json' } });

  await assert.rejects(apiRequest('/auth/login', { method: 'POST', body: {} }), (error) => error.status === 401);

  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), 'existing.jwt');
  assert.equal(handlerCalls, 0);
});

test('returns null for a successful 204 response', async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await apiRequest('/notes/123', { method: 'DELETE' }), null);
});

test('maps network failures and timeouts to a safe Cannot reach server ApiError', async () => {
  globalThis.fetch = async () => { throw new TypeError('private transport detail'); };
  await assert.rejects(apiRequest('/health'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.message, 'Cannot reach server');
    assert.equal(error.status, 0);
    return true;
  });

  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
  });
  await assert.rejects(apiRequest('/health', { timeoutMs: 5 }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.message, 'Cannot reach server');
    assert.equal(error.timedOut, true);
    return true;
  });
});
