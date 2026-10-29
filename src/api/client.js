const viteEnv = import.meta.env ?? {};
const configuredApiUrl = typeof viteEnv.VITE_API_URL === 'string' ? viteEnv.VITE_API_URL.trim() : '';

export const API_BASE_URL = (configuredApiUrl || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
export const TOKEN_STORAGE_KEY = 'notes.token';
export const REQUEST_TIMEOUT_MS = 10_000;

const AUTH_ENDPOINTS = new Set(['auth/login', 'auth/register']);
let unauthorizedHandler = null;

const DEFAULT_MESSAGES = new Map([
  [400, 'Invalid input'],
  [401, 'Authentication required'],
  [403, "You don't have access to this resource."],
  [404, 'Resource not found.'],
  [409, 'The request conflicts with existing data.'],
  [413, 'Request body too large'],
  [429, 'Too many requests. Please wait a moment.'],
]);

export class ApiError extends Error {
  constructor({ status = 0, code = 'REQUEST_FAILED', message = 'Request failed.', details = [], cause, timedOut = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
    this.timedOut = timedOut;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Register the AuthContext's central 401 reaction. Returns an unregister function. */
export function setUnauthorizedHandler(handler) {
  if (handler !== null && typeof handler !== 'function') {
    throw new TypeError('Unauthorized handler must be a function or null');
  }

  const previousHandler = unauthorizedHandler;
  unauthorizedHandler = handler;

  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = previousHandler;
  };
}

export function readStoredToken() {
  try {
    return globalThis.localStorage?.getItem(TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function clearStoredToken() {
  try {
    globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in browser privacy modes; the request still fails safely.
  }
}

/** Persist the session token. Throws a user-safe Error if the browser blocks storage. */
export function storeToken(token) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) throw new Error('Storage unavailable');
    storage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    throw new Error('This browser could not save your session. Check local storage settings and try again.');
  }
}

/**
 * Fire-and-forget request that wakes a sleeping free-tier host (for example Render) while the
 * visitor is still reading the page. It sends no credentials and never throws.
 */
export function wakeServer() {
  try {
    if (typeof fetch !== 'function') return;
    void fetch(`${API_BASE_URL}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
  } catch {
    // Warming the server is best effort only.
  }
}

function dispatchUnauthorizedEvent() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;

  const event = typeof CustomEvent === 'function'
    ? new CustomEvent('notes:unauthorized')
    : new Event('notes:unauthorized');
  window.dispatchEvent(event);
}

function handleUnauthorized() {
  clearStoredToken();

  if (typeof unauthorizedHandler === 'function') {
    try {
      unauthorizedHandler();
    } catch {
      dispatchUnauthorizedEvent();
    }
    return;
  }

  // AuthContext (Step 3.4) can listen for this event when no handler is registered.
  dispatchUnauthorizedEvent();
}

function normalizePath(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new TypeError('API path must be a non-empty relative path');
  }

  const trimmed = path.trim();
  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    throw new TypeError('API path must be relative to VITE_API_URL');
  }

  const relativePath = trimmed.replace(/^\/+/, '');
  const routePath = relativePath.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return { relativePath, routePath };
}

function isNativeBody(value) {
  return (typeof FormData !== 'undefined' && value instanceof FormData)
    || (typeof Blob !== 'undefined' && value instanceof Blob)
    || (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams)
    || (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer)
    || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value));
}

function fallbackMessage(status) {
  if (status >= 500) return 'The server could not complete the request.';
  return DEFAULT_MESSAGES.get(status) ?? 'Request failed.';
}

async function readJsonResponse(response) {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    // Never surface non-JSON response bodies (which may contain HTML or stack traces).
    return null;
  }
}

/**
 * Make one request to the API, returning the parsed JSON payload or null for 204.
 * Pass JSON bodies as objects; set { auth: false } for public requests.
 */
export async function apiRequest(path, options = {}) {
  const { relativePath, routePath } = normalizePath(path);
  const {
    method = 'GET',
    headers: suppliedHeaders,
    body,
    signal,
    auth = true,
    timeoutMs = REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive finite number');
  }

  const headers = new Headers(suppliedHeaders ?? {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let requestBody = body;
  if (body !== undefined && !isNativeBody(body)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (typeof body !== 'string') requestBody = JSON.stringify(body);
  }

  if (AUTH_ENDPOINTS.has(routePath)) {
    // Do not send an old session token on login or registration requests.
    headers.delete('Authorization');
  } else if (auth) {
    const token = readStoredToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let externalAbortHandler;
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      externalAbortHandler = () => controller.abort(signal.reason);
      signal.addEventListener('abort', externalAbortHandler, { once: true });
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/${relativePath}`, {
      ...fetchOptions,
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
      signal: controller.signal,
    });

    const payload = await readJsonResponse(response);
    if (!response.ok) {
      if (response.status === 401 && routePath !== 'auth/login') handleUnauthorized();

      const envelope = payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
        ? payload.error
        : {};
      throw new ApiError({
        status: response.status,
        code: typeof envelope.code === 'string' ? envelope.code : 'HTTP_ERROR',
        message: typeof envelope.message === 'string' ? envelope.message : fallbackMessage(response.status),
        details: envelope.details,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted && !timedOut) throw error;

    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach server',
      cause: error,
      timedOut,
    });
  } finally {
    clearTimeout(timeoutId);
    if (signal && externalAbortHandler) signal.removeEventListener('abort', externalAbortHandler);
  }
}
