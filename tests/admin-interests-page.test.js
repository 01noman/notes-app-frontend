import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let AdminInterests;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  ({ default: AdminInterests } = await vite.ssrLoadModule('/src/pages/AdminInterests.jsx'));
});

after(async () => {
  await vite?.close();
});

test('AdminInterests renders grouped-list heading and starts in a loading state', () => {
  const html = renderToStaticMarkup(React.createElement(AdminInterests));
  assert.match(html, /<h1>Users by Interest<\/h1>/);
  assert.match(html, /Groups of users sharing each interest/);
  assert.match(html, /Loading interests…/);
  assert.match(html, /aria-label="Pagination"/);
});

test('AdminInterests offers the supported page sizes and documents the group fields', () => {
  const html = renderToStaticMarkup(React.createElement(AdminInterests));
  assert.match(html, /Interests per page/);
  assert.match(html, /<option value="10" selected="">10<\/option>/);
  assert.match(html, /<option value="25">25<\/option>/);
  assert.match(html, /<option value="50">50<\/option>/);
  assert.match(html, /Interest/);
  assert.match(html, /Users/);
});
