import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let App;
let APP_PATHS;
let AuthProvider;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ default: App, APP_PATHS } = await vite.ssrLoadModule('/src/App.jsx'));
  ({ AuthProvider } = await vite.ssrLoadModule('/src/auth/AuthContext.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderAt(pathname) {
  const element = React.createElement(
    MemoryRouter,
    { initialEntries: [pathname] },
    React.createElement(AuthProvider, null, React.createElement(App)),
  );
  return renderToStaticMarkup(element);
}

test('route table declares every required screen and access path', () => {
  assert.deepEqual(APP_PATHS, {
    home: '/',
    login: '/login',
    register: '/register',
    notes: '/notes',
    profile: '/profile',
    publicPosts: '/users/:id/posts',
    adminUsers: '/admin/users',
    adminNotes: '/admin/notes',
    adminInterests: '/admin/interests',
    notFound: '*',
  });
});

test('Login and Register routes render their forms inside the shared header layout', () => {
  const login = renderAt(APP_PATHS.login);
  assert.match(login, /id="login-heading">Log in<\/h1>/);
  assert.match(login, /aria-label="Main navigation"/);
  assert.match(login, /href="\/register"/);

  const register = renderAt(APP_PATHS.register);
  assert.match(register, /id="register-heading">Create account<\/h1>/);
  assert.match(register, /href="\/login"/);
});

test('public user posts route renders for an anonymous visitor', () => {
  const html = renderAt('/users/0123456789abcdef01234567/posts');
  assert.match(html, /<h1>Public user posts<\/h1>/);
  assert.match(html, /Loading public posts…/);
  assert.doesNotMatch(html, /Page not found/);
});

test('protected and admin routes are matched instead of falling through to Not Found', () => {
  for (const pathname of [
    APP_PATHS.notes,
    APP_PATHS.profile,
    APP_PATHS.adminUsers,
    APP_PATHS.adminNotes,
    APP_PATHS.adminInterests,
  ]) {
    const html = renderAt(pathname);
    assert.doesNotMatch(html, /id="not-found-heading"/, `${pathname} must be a registered route`);
  }
});

test('unknown paths render an accessible Not Found page with recovery links', () => {
  const html = renderAt('/this-route-does-not-exist');
  assert.match(html, /<h1 id="not-found-heading">Page not found<\/h1>/);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/login"/);
});
