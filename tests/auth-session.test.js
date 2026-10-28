import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authReducer, createInitialAuthState, getGuardDecision } from '../src/auth/session.js';

const regularUser = { _id: 'user-1', name: 'Ada', email: 'ada@example.com', role: 'user' };
const adminUser = { _id: 'admin-1', name: 'Grace', email: 'grace@example.com', role: 'admin' };

test('starts anonymous when no stored token exists', () => {
  assert.deepEqual(createInitialAuthState(false), { status: 'anonymous', user: null, notice: null });
});

test('starts verifying rather than trusting a stored token before /users/me succeeds', () => {
  assert.deepEqual(createInitialAuthState(true), { status: 'verifying', user: null, notice: null });
});

test('a verified session uses the user returned by the API', () => {
  assert.deepEqual(authReducer(createInitialAuthState(true), { type: 'SESSION_VERIFIED', user: regularUser }), {
    status: 'authenticated', user: regularUser, notice: null,
  });
});

test('a successful login stores authenticated state and clears previous notices', () => {
  const previous = { status: 'anonymous', user: null, notice: 'Session expired. Please log in again.' };
  assert.deepEqual(authReducer(previous, { type: 'SIGNED_IN', user: regularUser }), {
    status: 'authenticated', user: regularUser, notice: null,
  });
});

test('failed boot verification clears user state and returns to anonymous', () => {
  const previous = { status: 'verifying', user: null, notice: null };
  assert.deepEqual(authReducer(previous, { type: 'SESSION_FAILED' }), {
    status: 'anonymous', user: null, notice: null,
  });
});

test('logout clears the in-memory user', () => {
  const previous = { status: 'authenticated', user: regularUser, notice: null };
  assert.deepEqual(authReducer(previous, { type: 'SIGNED_OUT' }), {
    status: 'anonymous', user: null, notice: null,
  });
});

test('an expired session can retain a user-visible notice after logout', () => {
  const previous = { status: 'authenticated', user: regularUser, notice: null };
  assert.deepEqual(authReducer(previous, { type: 'SIGNED_OUT', notice: 'Session expired. Please log in again.' }), {
    status: 'anonymous', user: null, notice: 'Session expired. Please log in again.',
  });
});

test('clearing the notice leaves the session state unchanged', () => {
  const previous = { status: 'anonymous', user: null, notice: 'Session expired. Please log in again.' };
  assert.deepEqual(authReducer(previous, { type: 'CLEAR_NOTICE' }), { status: 'anonymous', user: null, notice: null });
});

test('all guards wait while the stored token is being verified', () => {
  for (const mode of ['auth', 'admin', 'anonymous']) {
    assert.deepEqual(getGuardDecision({ status: 'verifying', user: null, mode }), { type: 'loading' });
  }
});

test('protected route redirects an anonymous visitor to login and remembers the source location', () => {
  const from = { pathname: '/notes', search: '?page=2' };
  assert.deepEqual(getGuardDecision({ status: 'anonymous', user: null, mode: 'auth', from }), {
    type: 'redirect', to: '/login', replace: true, state: { from },
  });
});

test('authenticated users can enter protected user routes', () => {
  assert.deepEqual(getGuardDecision({ status: 'authenticated', user: regularUser, mode: 'auth' }), { type: 'allow' });
});

test('a signed-in non-admin gets Forbidden instead of a redirect loop on admin routes', () => {
  assert.deepEqual(getGuardDecision({ status: 'authenticated', user: regularUser, mode: 'admin' }), { type: 'forbidden' });
});

test('an anonymous visitor to an admin route is redirected to login with the source location', () => {
  const from = { pathname: '/admin/users' };
  assert.deepEqual(getGuardDecision({ status: 'anonymous', user: null, mode: 'admin', from }), {
    type: 'redirect', to: '/login', replace: true, state: { from },
  });
});

test('authenticated admins can enter admin routes', () => {
  assert.deepEqual(getGuardDecision({ status: 'authenticated', user: adminUser, mode: 'admin' }), { type: 'allow' });
});

test('anonymous-only routes redirect an existing session to /notes', () => {
  assert.deepEqual(getGuardDecision({ status: 'authenticated', user: regularUser, mode: 'anonymous' }), {
    type: 'redirect', to: '/notes', replace: true,
  });
});

test('anonymous-only routes allow anonymous visitors', () => {
  assert.deepEqual(getGuardDecision({ status: 'anonymous', user: null, mode: 'anonymous' }), { type: 'allow' });
});
