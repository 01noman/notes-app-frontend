import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let Header;
let Pagination;
let Message;
let getPaginationState;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ default: Header } = await vite.ssrLoadModule('/src/components/Header.jsx'));
  ({ default: Pagination, getPaginationState } = await vite.ssrLoadModule('/src/components/Pagination.jsx'));
  ({ default: Message } = await vite.ssrLoadModule('/src/components/Message.jsx'));
});

after(async () => {
  await vite?.close();
});

function render(Component, props = {}) {
  const element = React.createElement(Component, props);
  return renderToStaticMarkup(element);
}

function renderHeader(props = {}) {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(Header, props)),
  );
}

test('anonymous Header exposes Login and Register without protected links', () => {
  const html = renderHeader();

  assert.match(html, />Login<\/a>/);
  assert.match(html, />Register<\/a>/);
  assert.doesNotMatch(html, />My Notes<\/a>/);
  assert.doesNotMatch(html, />Users<\/a>/);
});

test('regular-user Header shows My Notes and Profile but no admin links', () => {
  const html = renderHeader({
    user: { _id: '1234567890abcdef', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' },
    onLogout() {},
  });

  assert.match(html, /Ada Lovelace/);
  assert.match(html, />User<\/span>/);
  assert.match(html, />My Notes<\/a>/);
  assert.match(html, />Profile<\/a>/);
  assert.match(html, />Log out<\/button>/);
  assert.doesNotMatch(html, />Interests<\/a>/);
});

test('admin Header exposes all admin navigation links', () => {
  const html = renderHeader({ user: { name: 'Ada Admin', role: 'admin' }, onLogout() {} });

  assert.match(html, />Users<\/a>/);
  assert.match(html, />All Notes<\/a>/);
  assert.match(html, />Interests<\/a>/);
  assert.match(html, />Admin<\/span>/);
});

test('Pagination disables controls at the boundaries and while loading', () => {
  const firstPage = render(Pagination, { page: 1, totalPages: 3, onPageChange() {} });
  assert.match(firstPage, /<button[^>]*disabled[^>]*>Prev<\/button>/);
  assert.match(firstPage, /Page 1 of 3/);
  assert.doesNotMatch(firstPage, /<button[^>]*disabled[^>]*>Next<\/button>/);

  const lastPage = render(Pagination, { page: 3, totalPages: 3, onPageChange() {} });
  assert.match(lastPage, /Page 3 of 3/);
  assert.match(lastPage, /<button[^>]*disabled[^>]*>Next<\/button>/);

  const loading = render(Pagination, { page: 2, totalPages: 3, loading: true, onPageChange() {} });
  assert.match(loading, /<button[^>]*disabled[^>]*>Prev<\/button>/);
  assert.match(loading, /<button[^>]*disabled[^>]*>Next<\/button>/);
});

test('Pagination reports a single disabled page for an empty result set', () => {
  const html = render(Pagination, { page: 1, totalPages: 0, onPageChange() {} });

  assert.match(html, /Page 1 of 1/);
  assert.match(html, /<button[^>]*disabled[^>]*>Prev<\/button>/);
  assert.match(html, /<button[^>]*disabled[^>]*>Next<\/button>/);
  assert.deepEqual(getPaginationState({ page: 1, totalPages: 0 }), {
    page: 1,
    displayTotalPages: 1,
    previousDisabled: true,
    nextDisabled: true,
  });
});

test('Pagination sends requested page numbers through its callbacks', () => {
  const requestedPages = [];
  const tree = Pagination({ page: 2, totalPages: 4, onPageChange: (page) => requestedPages.push(page) });
  const [previousButton, , nextButton] = tree.props.children;

  previousButton.props.onClick();
  nextButton.props.onClick();

  assert.deepEqual(requestedPages, [1, 3]);
});

test('Message renders accessible loading, empty, success and retryable error states', () => {
  assert.match(render(Message, { kind: 'loading' }), /role="status"[^>]*aria-live="polite"/);
  assert.match(render(Message, { kind: 'empty', message: 'You have no notes yet.' }), /You have no notes yet\./);
  assert.match(render(Message, { kind: 'success', message: 'Note created' }), /role="status"/);

  const errorHtml = render(Message, { kind: 'error', message: 'Cannot reach server', onRetry() {} });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /Cannot reach server/);
  assert.match(errorHtml, />Retry<\/button>/);
});

test('Message never attempts to render a raw object as user-facing text', () => {
  const html = render(Message, { kind: 'error', message: { stack: 'private stack trace' } });

  assert.match(html, /Something went wrong\./);
  assert.doesNotMatch(html, /private stack trace/);
});
