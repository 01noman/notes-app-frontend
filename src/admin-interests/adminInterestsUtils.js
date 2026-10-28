const OBJECT_ID = /^[0-9a-f]{24}$/i;
const PAGE_SIZES = new Set([10, 25, 50]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePagination(value, groupCount) {
  if (!isRecord(value)) throw new TypeError('Invalid grouped interests response.');
  const { page, limit, total, totalPages } = value;
  if (!Number.isInteger(page) || page < 1
    || !Number.isInteger(limit) || !PAGE_SIZES.has(limit)
    || !Number.isInteger(total) || total < 0
    || totalPages !== Math.ceil(total / limit)
    || groupCount > limit || total < groupCount) {
    throw new TypeError('Invalid grouped interests response.');
  }
  return { page, limit, total, totalPages };
}

export function normalizeAdminInterestsResponse(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new TypeError('Invalid grouped interests response.');
  }

  const interests = payload.data.map((group) => {
    if (!isRecord(group)
      || typeof group.interest !== 'string' || group.interest.trim() === ''
      || group.interest !== group.interest.trim().toLowerCase()
      || !Number.isInteger(group.count) || group.count < 1
      || !Array.isArray(group.users) || group.users.length !== group.count) {
      throw new TypeError('Invalid grouped interests response.');
    }
    const users = group.users.map((user) => {
      if (!isRecord(user)
        || typeof user._id !== 'string' || !OBJECT_ID.test(user._id)
        || typeof user.name !== 'string' || user.name.trim() === ''
        || typeof user.email !== 'string' || user.email.trim() === '') {
        throw new TypeError('Invalid grouped interests response.');
      }
      return { _id: user._id.toLowerCase(), name: user.name, email: user.email };
    });
    return { interest: group.interest, count: group.count, users };
  });

  const names = interests.map((item) => item.interest);
  if (new Set(names).size !== names.length) throw new TypeError('Invalid grouped interests response.');

  const pagination = normalizePagination(payload.pagination, interests.length);
  return { interests, pagination };
}

export function buildAdminInterestsRequest(page, limit) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be a positive integer');
  if (!Number.isInteger(limit) || !PAGE_SIZES.has(limit)) throw new RangeError('limit must be 10, 25, or 50');
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return `users/grouped-by-interests?${query.toString()}`;
}

export function resolveAdminInterestsPage(requestedPage, pagination) {
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalPages = Number.isInteger(pagination?.totalPages) && pagination.totalPages >= 0
    ? pagination.totalPages
    : 0;
  return Math.min(page, Math.max(1, totalPages));
}

export function getAdminInterestsErrorMessage(error) {
  const status = Number(error?.status) || 0;
  const code = typeof error?.code === 'string' ? error.code : '';
  if (status === 403) return "You don't have access to this page.";
  if (status === 400) return 'The grouped interests request was rejected. Check the pagination values.';
  if (status === 401) return 'Your session is no longer valid. Please log in again.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status === 0 || error?.timedOut === true || code === 'NETWORK_ERROR') {
    return 'Cannot reach server. It may be waking up; please retry.';
  }
  if (status >= 500) return 'The server could not complete the request. Please try again.';
  return 'Could not load grouped interests. Please try again.';
}

export function isAdminInterestsRetryableError(error) {
  const status = Number(error?.status) || 0;
  return status === 0 || error?.timedOut === true || status >= 500;
}
