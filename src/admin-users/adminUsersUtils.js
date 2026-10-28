const OBJECT_ID = /^[0-9a-f]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZES = new Set([10, 25, 50]);
const ROLES = new Set(['user', 'admin']);
const USER_FIELDS = new Set(['name', 'email', 'password', 'role', 'interests']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(new Date(value).getTime())) return null;
  return new Date(value).toISOString();
}

export function normalizeAdminUser(value) {
  if (!isRecord(value)
    || typeof value._id !== 'string'
    || !OBJECT_ID.test(value._id)
    || typeof value.name !== 'string'
    || typeof value.email !== 'string'
    || !ROLES.has(value.role)
    || !Array.isArray(value.interests)
    || value.interests.some((interest) => typeof interest !== 'string')) {
    throw new Error('The server returned invalid user data.');
  }

  return {
    _id: value._id.toLowerCase(),
    name: value.name,
    email: value.email,
    role: value.role,
    interests: [...value.interests],
    createdAt: validDate(value.createdAt),
  };
}

export function normalizeAdminUsersResponse(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.pagination)) {
    throw new Error('The server returned an invalid users list.');
  }

  const { page, limit, total, totalPages } = payload.pagination;
  if (!Number.isInteger(page) || page < 1
    || !Number.isInteger(limit) || !PAGE_SIZES.has(limit)
    || !Number.isInteger(total) || total < 0
    || !Number.isInteger(totalPages) || totalPages < 0) {
    throw new Error('The server returned invalid pagination data.');
  }

  const users = payload.data.map(normalizeAdminUser);
  // An out-of-range requested page can legitimately return an empty list with totalPages < page.
  // The page helper clamps it and the UI then refetches the last valid page.
  if (users.length > limit) {
    throw new Error('The server returned inconsistent pagination data.');
  }

  return {
    users,
    pagination: { page, limit, total, totalPages },
  };
}

export function normalizeAdminUserResponse(payload, expectedId = null) {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.user)) {
    throw new Error('The server returned an invalid user response.');
  }
  const user = normalizeAdminUser(payload.data.user);
  if (expectedId && user._id !== String(expectedId).toLowerCase()) {
    throw new Error('The server returned a different user than requested.');
  }
  return user;
}

export function parseAdminInterests(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function validateAdminUserForm(form, mode = 'create') {
  const errors = {};
  const name = typeof form?.name === 'string' ? form.name.trim() : '';
  const email = typeof form?.email === 'string' ? form.email.trim().toLowerCase() : '';
  const password = typeof form?.password === 'string' ? form.password : '';
  const role = form?.role;
  const rawInterests = typeof form?.interests === 'string' ? form.interests.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const interests = parseAdminInterests(form?.interests);

  if (!name) errors.name = 'Name is required.';
  else if (name.length > 80) errors.name = 'Name must be at most 80 characters.';

  if (!email) errors.email = 'Email is required.';
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = 'Enter a valid email address.';

  if (mode === 'create' && !password) errors.password = 'Password is required.';
  if (password && password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (password && new TextEncoder().encode(password).length > 72) errors.password = 'Password must be at most 72 bytes.';

  if (!ROLES.has(role)) errors.role = 'Choose a valid role.';

  if (interests.length > 10) errors.interests = 'Enter no more than 10 interests.';
  else if (rawInterests.some((interest) => interest.length > 30)) errors.interests = 'Each interest must be at most 30 characters.';

  return errors;
}

export function buildAdminUserPayload(form, mode = 'create') {
  const payload = {
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    role: form.role,
    interests: parseAdminInterests(form.interests),
  };
  if (mode === 'create' || form.password) payload.password = form.password;
  return payload;
}

export function mapAdminUserValidationDetails(details, allowedFields = USER_FIELDS) {
  const fieldErrors = {};
  let hasUnknown = false;
  if (!Array.isArray(details)) return { fieldErrors, formError: null };

  for (const detail of details) {
    if (!isRecord(detail) || typeof detail.field !== 'string' || typeof detail.message !== 'string') {
      hasUnknown = true;
      continue;
    }
    const field = detail.field.startsWith('interests.') ? 'interests' : detail.field;
    if (!allowedFields.has(field)) {
      hasUnknown = true;
      continue;
    }
    fieldErrors[field] ??= detail.message;
  }

  return {
    fieldErrors,
    formError: hasUnknown ? 'Some input was not accepted. Check the form and try again.' : null,
  };
}

export function getAdminUsersErrorMessage(error, operation = 'load') {
  const status = Number(error?.status) || 0;
  const code = typeof error?.code === 'string' ? error.code : '';

  if (status === 403) return "You don't have access to this page.";
  if (status === 404 && ['edit', 'delete'].includes(operation)) return 'This user no longer exists. Refresh the list and try again.';
  if (status === 409 || code === 'EMAIL_TAKEN') return 'Email is already registered.';
  if (status === 400) return 'Check the highlighted fields and try again.';
  if (status === 401) return 'Your session is no longer valid. Please log in again.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status === 0 || error?.timedOut || code === 'NETWORK_ERROR') return 'Cannot reach server. Check your connection and try again.';
  if (status >= 500) return 'The server could not complete the request. Please try again.';
  if (operation === 'create') return 'Could not add this user. Please try again.';
  if (operation === 'edit') return 'Could not update this user. Please try again.';
  if (operation === 'delete') return 'Could not delete this user. Please try again.';
  return 'Could not load users. Please try again.';
}

export function isAdminUsersRetryableError(error) {
  const status = Number(error?.status) || 0;
  return status === 0 || error?.timedOut === true || status >= 500;
}

export function resolveAdminUsersPage(requestedPage, pagination) {
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalPages = Number.isInteger(pagination?.totalPages) && pagination.totalPages >= 0
    ? pagination.totalPages
    : 0;
  return Math.min(page, Math.max(1, totalPages));
}

export function buildAdminUsersRequest(page, limit) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be a positive integer');
  if (!Number.isInteger(limit) || !PAGE_SIZES.has(limit)) throw new RangeError('limit must be 10, 25, or 50');
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return `users?${query.toString()}`;
}

export function isCurrentAdminUser(currentUserId, targetUserId) {
  return typeof currentUserId === 'string'
    && typeof targetUserId === 'string'
    && currentUserId.toLowerCase() === targetUserId.toLowerCase();
}

export function canDeleteAdminUser(currentUserId, targetUserId) {
  return !isCurrentAdminUser(currentUserId, targetUserId);
}

export function canChangeAdminUserRole(currentUserId, targetUserId) {
  return !isCurrentAdminUser(currentUserId, targetUserId);
}
