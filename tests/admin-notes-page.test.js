import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let AdminNotes;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  ({ default: AdminNotes } = await vite.ssrLoadModule('/src/pages/AdminNotes.jsx'));
});

after(async () => {
  await vite?.close();
});

test('AdminNotes renders the owner filter, read-only table headings, and loading state', () => {
  const html = renderToStaticMarkup(React.createElement(AdminNotes));
  assert.match(html, /<h1>All Notes<\/h1>/);
  assert.match(html, /<label for="admin-notes-owner-filter">Owner user ID \(optional\)<\/label>/);
  assert.match(html, /name="ownerId"/);
  assert.match(html, />Apply filter<\/button>/);
  assert.match(html, /<th scope="col">Title<\/th>/);
  assert.match(html, /<th scope="col">Owner ID<\/th>/);
  assert.match(html, /<th scope="col">Updated<\/th>/);
  assert.match(html, /Loading notes…/);
  assert.match(html, /aria-label="Pagination"/);
});

test('AdminNotes offers the supported page sizes and no edit/delete controls', () => {
  const html = renderToStaticMarkup(React.createElement(AdminNotes));
  assert.match(html, /Notes per page/);
  assert.match(html, /<option value="10" selected="">10<\/option>/);
  assert.match(html, /<option value="25">25<\/option>/);
  assert.match(html, /<option value="50">50<\/option>/);
  assert.doesNotMatch(html, />Edit<\/button>|>Delete<\/button>/);
});
