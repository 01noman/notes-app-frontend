import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminUserPayload,
  buildAdminUsersRequest,
  canChangeAdminUserRole,
  canDeleteAdminUser,
  getAdminUsersErrorMessage,
  isAdminUsersRetryableError,
  mapAdminUserValidationDetails,
  normalizeAdminUserResponse,
  normalizeAdminUsersResponse,
  parseAdminInterests,
  resolveAdminUsersPage,
  validateAdminUserForm,
} from '../src/admin-users/adminUsersUtils.js';

const selfId = '64f000000000000000000001';
const otherId = '64f000000000000000000002';
const validUser = {
  _id: otherId,
  name: 'Alex Example',
  email: 'alex@example.com',
  role: 'user',
  interests: ['reading'],
  createdAt: '2026-10-20T10:30:00.000Z',
  passwordHash: 'must-not-escape',
  password: 'must-not-escape',
};

function listPayload(users = [validUser], overrides = {}) {
  return {
    data: users,
    pagination: { page: 1, limit: 10, total: users.length, totalPages: users.length ? 1 : 0, ...overrides },
  };
}

test('normalizes users and allows only public account fields', () => {
  const result = normalizeAdminUsersResponse(listPayload());
  assert.deepEqual(result.users[0], {
    _id: otherId,
    name: 'Alex Example',
    email: 'alex@example.com',
    role: 'user',
    interests: ['reading'],
    createdAt: '2026-10-20T10:30:00.000Z',
  });
  assert.equal('passwordHash' in result.users[0], false);
  assert.equal('password' in result.users[0], false);
});

test('rejects malformed users-list envelopes, rows, and pagination', () => {
  assert.throws(() => normalizeAdminUsersResponse({ data: [], pagination: null }), /invalid users list/i);
  assert.throws(() => normalizeAdminUsersResponse(listPayload([{ ...validUser, role: 'owner' }])), /invalid user data/i);
  assert.throws(() => normalizeAdminUsersResponse(listPayload([validUser], { limit: 5 })), /invalid pagination/i);
  assert.deepEqual(
    normalizeAdminUsersResponse({ data: [], pagination: { page: 3, limit: 10, total: 12, totalPages: 2 } }).pagination,
    { page: 3, limit: 10, total: 12, totalPages: 2 },
  );
});

test('normalizes one-user responses and checks the expected id', () => {
  assert.equal(normalizeAdminUserResponse({ data: { user: validUser } }, otherId).email, validUser.email);
  assert.throws(() => normalizeAdminUserResponse({ data: { user: validUser } }, selfId), /different user/i);
  assert.throws(() => normalizeAdminUserResponse({ data: {} }), /invalid user response/i);
});

test('admin user list request validates and serializes pagination', () => {
  assert.equal(buildAdminUsersRequest(3, 25), 'users?page=3&limit=25');
  assert.throws(() => buildAdminUsersRequest(0, 10), /page/i);
  assert.throws(() => buildAdminUsersRequest(1, 51), /limit/i);
});

test('interest input is trimmed, lowercased, and deduplicated', () => {
  assert.deepEqual(parseAdminInterests(' Chess, reading,CHESS,, Music '), ['chess', 'reading', 'music']);
  assert.deepEqual(validateAdminUserForm({ name: 'Alex', email: 'alex@example.com', password: 'long-password', role: 'user', interests: Array(11).fill('chess').join(',') }, 'create'), {});
});

test('create validation requires valid fields and enforces all input limits', () => {
  assert.deepEqual(validateAdminUserForm({
    name: ' Alex ', email: 'Alex@example.com', password: 'long-password', role: 'user', interests: 'chess, reading',
  }, 'create'), {});

  assert.deepEqual(validateAdminUserForm({
    name: ' ', email: 'bad', password: 'short', role: 'root', interests: Array.from({ length: 11 }, (_, i) => `i${i}`).join(','),
  }, 'create'), {
    name: 'Name is required.',
    email: 'Enter a valid email address.',
    password: 'Password must be at least 8 characters.',
    role: 'Choose a valid role.',
    interests: 'Enter no more than 10 interests.',
  });

  assert.equal(validateAdminUserForm({
    name: 'A'.repeat(81), email: 'alex@example.com', password: 'ok-password', role: 'user', interests: 'x'.repeat(31),
  }, 'create').name, 'Name must be at most 80 characters.');
  assert.equal(validateAdminUserForm({
    name: 'Alex', email: 'alex@example.com', password: 'ok-password', role: 'user', interests: 'x'.repeat(31),
  }, 'create').interests, 'Each interest must be at most 30 characters.');
});

test('edit validation keeps password optional but validates a supplied password', () => {
  assert.deepEqual(validateAdminUserForm({
    name: 'Alex', email: 'alex@example.com', password: '', role: 'user', interests: '',
  }, 'edit'), {});
  assert.equal(validateAdminUserForm({
    name: 'Alex', email: 'alex@example.com', password: 'short', role: 'user', interests: '',
  }, 'edit').password, 'Password must be at least 8 characters.');
});

test('builds normalized create/edit payloads and omits an empty edit password', () => {
  const form = { name: ' Alex ', email: ' ALEX@Example.COM ', password: '', role: 'user', interests: 'Chess, chess, Reading' };
  assert.deepEqual(buildAdminUserPayload(form, 'edit'), {
    name: 'Alex', email: 'alex@example.com', role: 'user', interests: ['chess', 'reading'],
  });
  assert.deepEqual(buildAdminUserPayload({ ...form, password: 'safe-password' }, 'create'), {
    name: 'Alex', email: 'alex@example.com', role: 'user', interests: ['chess', 'reading'], password: 'safe-password',
  });
});

test('maps API validation details only to known fields', () => {
  assert.deepEqual(mapAdminUserValidationDetails([
    { field: 'email', message: 'Invalid email' },
    { field: 'interests.0', message: 'Interest too long' },
    { field: 'passwordHash', message: 'No' },
  ]), {
    fieldErrors: { email: 'Invalid email', interests: 'Interest too long' },
    formError: 'Some input was not accepted. Check the form and try again.',
  });
});

test('maps API errors safely and only retries network/server failures', () => {
  assert.equal(getAdminUsersErrorMessage({ status: 403 }), "You don't have access to this page.");
  assert.equal(getAdminUsersErrorMessage({ status: 409 }, 'create'), 'Email is already registered.');
  assert.equal(getAdminUsersErrorMessage({ status: 404 }, 'delete'), 'This user no longer exists. Refresh the list and try again.');
  assert.equal(getAdminUsersErrorMessage({ status: 0 }, 'load'), 'Cannot reach server. Check your connection and try again.');
  assert.equal(getAdminUsersErrorMessage({ status: 503, message: 'private stack' }, 'edit'), 'The server could not complete the request. Please try again.');
  assert.equal(isAdminUsersRetryableError({ status: 0 }), true);
  assert.equal(isAdminUsersRetryableError({ status: 503 }), true);
  assert.equal(isAdminUsersRetryableError({ status: 400 }), false);
});

test('clamps pagination and protects the signed-in admin from destructive/self-role actions', () => {
  assert.equal(resolveAdminUsersPage(8, { totalPages: 3 }), 3);
  assert.equal(resolveAdminUsersPage(2, { totalPages: 0 }), 1);
  assert.equal(canDeleteAdminUser(selfId, selfId), false);
  assert.equal(canChangeAdminUserRole(selfId, selfId), false);
  assert.equal(canDeleteAdminUser(selfId, otherId), true);
  assert.equal(canChangeAdminUserRole(selfId, otherId), true);
});
