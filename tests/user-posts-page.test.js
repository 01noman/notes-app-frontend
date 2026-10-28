import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let UserPosts;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ default: UserPosts } = await vite.ssrLoadModule('/src/pages/UserPosts.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderPublicPosts() {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/users/64f000000000000000000001/posts'] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/users/:id/posts',
          element: React.createElement(UserPosts),
        }),
      ),
    ),
  );
}

test('public UserPosts page renders without AuthProvider and starts in a loading state', () => {
  const html = renderPublicPosts();
  assert.match(html, /<h1>Public user posts<\/h1>/);
  assert.match(html, /Loading public posts…/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Pagination"/);
});

test('public UserPosts page exposes supported page-size choices', () => {
  const html = renderPublicPosts();
  assert.match(html, /<label for="public-posts-limit">Posts per page<\/label>/);
  assert.match(html, /<option value="10" selected="">10<\/option>/);
  assert.match(html, /<option value="25">25<\/option>/);
  assert.match(html, /<option value="50">50<\/option>/);
});
