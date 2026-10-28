import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let AuthProvider;
let AdminUsers;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ AuthProvider } = await vite.ssrLoadModule('/src/auth/AuthContext.jsx'));
  ({ default: AdminUsers } = await vite.ssrLoadModule('/src/pages/AdminUsers.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderAdminUsers() {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/admin/users'] },
      React.createElement(AuthProvider, null, React.createElement(AdminUsers)),
    ),
  );
}

test('AdminUsers renders an accessible add-user form and initial loading state', () => {
  const html = renderAdminUsers();
  assert.match(html, /<h1>Users<\/h1>/);
  assert.match(html, /<h2 id="admin-users-create-heading">Add user<\/h2>/);
  assert.match(html, /<label for="admin-create-name">Name<\/label>/);
  assert.match(html, /<label for="admin-create-email">Email<\/label>/);
  assert.match(html, /<label for="admin-create-password">Password<\/label>/);
  assert.match(html, /<label for="admin-create-role">Role<\/label>/);
  assert.match(html, /<option value="user" selected="">User<\/option>/);
  assert.match(html, /<option value="admin">Admin<\/option>/);
  assert.match(html, /<label for="admin-create-interests">Interests \(optional\)<\/label>/);
  assert.match(html, /Add user<\/button>/);
  assert.match(html, /Loading users…/);
  assert.match(html, /aria-label="Pagination"/);
});

test('AdminUsers exposes list headings and the supported page-size choices while loading', () => {
  const html = renderAdminUsers();
  assert.match(html, /<h2 id="admin-users-list-heading">All users<\/h2>/);
  assert.match(html, /Users per page/);
  assert.match(html, /<option value="10" selected="">10<\/option>/);
  assert.match(html, /<option value="25">25<\/option>/);
  assert.match(html, /<option value="50">50<\/option>/);
});
