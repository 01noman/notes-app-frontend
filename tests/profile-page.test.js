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
let Profile;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ AuthProvider } = await vite.ssrLoadModule('/src/auth/AuthContext.jsx'));
  ({ default: Profile } = await vite.ssrLoadModule('/src/pages/Profile.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderProfile() {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/profile'] },
      React.createElement(AuthProvider, null, React.createElement(Profile)),
    ),
  );
}

test('Profile page renders labelled editable and read-only account fields', () => {
  const html = renderProfile();

  assert.match(html, /<h1>My Profile<\/h1>/);
  assert.match(html, /<label for="profile-name">Name<\/label>/);
  assert.match(html, /<input(?=[^>]*\bid="profile-name")(?=[^>]*\bname="name")(?=[^>]*\bmaxLength="80")[^>]*>/);
  assert.match(html, /<label for="profile-email">Email \(read-only\)<\/label>/);
  assert.match(html,/<input(?=[^>]*\bid="profile-email")(?=[^>]*\breadOnly="")(?=[^>]*\bname="email")[^>]*>/,);
  assert.match(html, /<label for="profile-role">Role \(read-only\)<\/label>/);
  assert.match(html,/<input(?=[^>]*\bid="profile-role")(?=[^>]*\breadOnly="")(?=[^>]*\bname="role")[^>]*>/,);
  assert.match(html, /<label for="profile-interests">Interests \(optional\)<\/label>/);
  assert.match(html, />Save profile<\/button>/);
});

test('Profile page renders the post composer, post body, public-page area, and pagination', () => {
  const html = renderProfile();

  assert.match(html, /<h2 id="profile-post-composer-heading">Publish a post<\/h2>/);
  assert.match(html, /<label for="profile-post-title">Title<\/label>/);
  assert.match(html, /<input(?=[^>]*\bid="profile-post-title")(?=[^>]*\bname="title")(?=[^>]*\bmaxLength="120")[^>]*>/);
  assert.match(html, /<label for="profile-post-body">Body<\/label>/);
  assert.match(html, /<textarea(?=[^>]*\bid="profile-post-body")(?=[^>]*\bname="body")(?=[^>]*\bmaxLength="5000")[^>]*>/);
  assert.match(html, />Publish<\/button>/);
  assert.match(html, /<h2 id="my-posts-heading">My Posts<\/h2>/);
  assert.match(html, /Posts per page/);
  assert.match(html, /aria-label="Pagination"/);
});
