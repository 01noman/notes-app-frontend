import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let NotesPage;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ default: NotesPage } = await vite.ssrLoadModule('/src/pages/Notes.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderNotesPage() {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/notes'] },
      React.createElement(NotesPage),
    ),
  );
}

test('Notes page renders labelled title/content fields and a create action', () => {
  const html = renderNotesPage();

  assert.match(html, /<h1[^>]*>My Notes<\/h1>/);
  assert.match(html, /<label for="note-title">Title<\/label>/);
  assert.match(html, /<input(?=[^>]*\bid="note-title")(?=[^>]*\bname="title")(?=[^>]*\bmaxLength="120")[^>]*>/);
  assert.match(html, /<label for="note-content">Content<\/label>/);
  assert.match(html, /<textarea(?=[^>]*\bid="note-content")(?=[^>]*\bname="content")(?=[^>]*\bmaxLength="10000")[^>]*>/);
  assert.match(html, />Save<\/button>/);
});

test('Notes page exposes pagination and the supported page sizes', () => {
  const html = renderNotesPage();

  assert.match(html, /aria-label="Pagination"/);
  assert.match(html, /Page 1 of 1/);
  assert.match(html, /<option(?=[^>]*\bvalue="10")(?=[^>]*\bselected="")[^>]*>10<\/option>/);
  assert.match(html, /<option(?=[^>]*\bvalue="25")[^>]*>25<\/option>/);
  assert.match(html, /<option(?=[^>]*\bvalue="50")[^>]*>50<\/option>/);
});

