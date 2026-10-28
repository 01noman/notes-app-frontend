import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import {
  getAuthErrorMessage,
  mapValidationDetails,
  parseInterests,
  validateLogin,
  validateRegister,
} from '../src/auth/formUtils.js';

const frontendRoot = resolve(import.meta.dirname, '..');
let vite;
let AuthProvider;
let Login;
let Register;

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    root: frontendRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  ({ AuthProvider } = await vite.ssrLoadModule('/src/auth/AuthContext.jsx'));
  ({ default: Login } = await vite.ssrLoadModule('/src/pages/Login.jsx'));
  ({ default: Register } = await vite.ssrLoadModule('/src/pages/Register.jsx'));
});

after(async () => {
  await vite?.close();
});

function renderPage(Page, entry) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      React.createElement(AuthProvider, null, React.createElement(Page)),
    ),
  );
}

test('Login renders labelled email and password fields and a register link', () => {
  const html = renderPage(Login, '/login');

  assert.match(html, /<h1 id="login-heading">Log in<\/h1>/);
  assert.match(html, /<label for="login-email">Email<\/label>/);

  // Check the input attributes without assuming their order.
  assert.match(
    html,
    /<input(?=[^>]*\bid="login-email")(?=[^>]*\bname="email")(?=[^>]*\btype="email")[^>]*>/,
  );

  assert.match(html, /<label for="login-password">Password<\/label>/);

  // Check the password input attributes without assuming their order.
  assert.match(
    html,
    /<input(?=[^>]*\bid="login-password")(?=[^>]*\bname="password")(?=[^>]*\btype="password")[^>]*>/,
  );

  assert.match(html, /type="submit"[^>]*>Log in<\/button>/);
  assert.match(html, /href="\/register"/);
});

test('Register renders name, email, password, optional interests, and a login link', () => {
  const html = renderPage(Register, '/register');

  assert.match(html, /<h1 id="register-heading">Create account<\/h1>/);
  assert.match(html, /<label for="register-name">Name<\/label>/);
  assert.match(html, /<label for="register-email">Email<\/label>/);
  assert.match(html, /<label for="register-password">Password<\/label>/);
  assert.match(html, /<label for="register-interests">Interests \(optional\)<\/label>/);
  assert.match(html, /placeholder="reading, chess, music"/);
  assert.match(html, /Separate interests with commas; enter up to 10\./);
  assert.match(html, /type="submit"[^>]*>Create account<\/button>/);
  assert.match(html, /href="\/login"/);
});

test('Login client validation checks email format and non-empty password', () => {
  assert.deepEqual(
    validateLogin({
      email: ' ADA@example.com ',
      password: 'correct-horse',
    }),
    {},
  );

  assert.deepEqual(
    validateLogin({
      email: 'not-an-email',
      password: '',
    }),
    {
      email: 'Enter a valid email address.',
      password: 'Password is required.',
    },
  );
});

test('Register client validation mirrors the required fields and password length', () => {
  assert.deepEqual(
    validateRegister({
      name: ' Ada ',
      email: 'ada@example.com',
      password: 'password-123',
      interests: '',
    }),
    {},
  );

  assert.deepEqual(
    validateRegister({
      name: ' ',
      email: 'bad',
      password: 'short',
    }),
    {
      name: 'Name is required.',
      email: 'Enter a valid email address.',
      password: 'Password must be at least 8 characters.',
    },
  );
});

test('interests are split, trimmed, lowercased and de-duplicated', () => {
  assert.deepEqual(
    parseInterests(' Chess, reading,CHESS,, Music , '),
    ['chess', 'reading', 'music'],
  );

  assert.deepEqual(parseInterests(' , , '), []);
});

test('Register validation prevents too many or overlong interests', () => {
  const base = {
    name: 'Ada',
    email: 'ada@example.com',
    password: 'password-123',
  };

  assert.equal(
    validateRegister({
      ...base,
      interests: Array.from(
        { length: 11 },
        (_, index) => `i${index}`,
      ).join(','),
    }).interests,
    'Enter no more than 10 interests.',
  );

  assert.equal(
    validateRegister({
      ...base,
      interests: 'x'.repeat(31),
    }).interests,
    'Each interest must be at most 30 characters.',
  );
});

test('API validation details map only to known form fields', () => {
  assert.deepEqual(
    mapValidationDetails(
      [
        { field: 'email', message: 'Invalid email' },
        { field: 'interests.0', message: 'Interest cannot be empty' },
        { field: 'role', message: 'Unknown field' },
      ],
      ['name', 'email', 'password', 'interests'],
    ),
    {
      fieldErrors: {
        email: 'Invalid email',
        interests: 'Interest cannot be empty',
      },
      formError: 'Invalid input. Please check the fields.',
    },
  );
});

test('authentication errors are presented with screen-specific safe messages', () => {
  assert.equal(
    getAuthErrorMessage({ status: 401 }, 'login'),
    'Invalid email or password.',
  );

  assert.equal(
    getAuthErrorMessage({ status: 409 }, 'register'),
    'Email already registered.',
  );

  assert.equal(
    getAuthErrorMessage({ status: 429 }, 'login'),
    'Too many attempts. Try again later.',
  );

  assert.equal(
    getAuthErrorMessage(
      { status: 0, code: 'NETWORK_ERROR' },
      'register',
    ),
    'Cannot reach server.',
  );

  assert.equal(
    getAuthErrorMessage(
      { status: 503, message: 'private stack' },
      'login',
    ),
    'The server could not complete the request. Please try again.',
  );

  assert.equal(
    getAuthErrorMessage(
      { message: { stack: 'private stack' } },
      'login',
    ),
    'Something went wrong. Please try again.',
  );
});