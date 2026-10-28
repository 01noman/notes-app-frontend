const MAX_NAME_LENGTH = 80;
const MAX_INTERESTS = 10;
const MAX_INTEREST_LENGTH = 30;
const MAX_POST_TITLE_LENGTH = 120;
const MAX_POST_BODY_LENGTH = 5000;
const PAGE_SIZES = new Set([10, 25, 50]);
const GENERIC_ERROR = 'Something went wrong. Please try again.';

function asString(value) {
  return typeof value === 'string' ? value : '';
}

export function parseProfileInterests(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map((interest) => interest.trim().toLowerCase()).filter(Boolean))];
}

export function validateProfileForm(form = {}) {
  const errors = {};
  const name = asString(form.name).trim();
  const interests = parseProfileInterests(form.interests);

  if (!name) errors.name = 'Name is required.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = 'Name must be at most 80 characters.';

  if (interests.length > MAX_INTERESTS) errors.interests = 'Enter no more than 10 interests.';
  else if (interests.some((interest) => interest.length > MAX_INTEREST_LENGTH)) {
    errors.interests = 'Each interest must be at most 30 characters.';
  }

  return errors;
}

export function validatePostForm(form = {}) {
  const errors = {};
  const title = asString(form.title).trim();
  const body = asString(form.body);

  if (!title) errors.title = 'Title is required.';
  else if (title.length > MAX_POST_TITLE_LENGTH) errors.title = 'Title must be at most 120 characters.';

  if (!body.trim()) errors.body = 'Body is required.';
  else if (body.length > MAX_POST_BODY_LENGTH) errors.body = 'Body must be at most 5000 characters.';

  return errors;
}

function isValidPagination(pagination) {
  if (!pagination || typeof pagination !== 'object') return false;
  const { page, limit, total, totalPages } = pagination;
  return Number.isInteger(page) && page >= 1
    && Number.isInteger(limit) && PAGE_SIZES.has(limit)
    && Number.isInteger(total) && total >= 0
    && Number.isInteger(totalPages) && totalPages >= 0
    && totalPages === Math.ceil(total / limit);
}

/** Validate the `{ data: { posts }, pagination }` API envelope before displaying it. */
export function normalizeMyPostsResponse(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data?.posts)
    || !isValidPagination(payload.pagination)) {
    throw new Error('The server returned an invalid posts response.');
  }

  const posts = payload.data.posts;
  const validPosts = posts.every((post) => post && typeof post === 'object'
    && typeof post._id === 'string' && post._id.length > 0
    && typeof post.title === 'string'
    && typeof post.body === 'string'
    && typeof post.createdAt === 'string' && !Number.isNaN(Date.parse(post.createdAt)));

  if (!validPosts || posts.length > payload.pagination.limit) {
    throw new Error('The server returned an invalid posts response.');
  }

  return { posts, pagination: payload.pagination };
}

/** Move to the last available page if a refresh/deletion made the requested page invalid. */
export function resolveProfilePostsPage(requestedPage, pagination) {
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const totalPages = Number.isInteger(pagination?.totalPages) && pagination.totalPages > 0
    ? pagination.totalPages
    : 1;
  return Math.min(page, totalPages);
}

export function getProfileErrorMessage(error, context = 'load') {
  if (!error || typeof error !== 'object') return GENERIC_ERROR;
  const status = error.status;

  if (status === 0 || error.code === 'NETWORK_ERROR' || error.timedOut === true) return 'Cannot reach server.';
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return "You don't have access to this page.";
  if (status === 404) return context === 'posts' ? 'Your public profile could not be found.' : 'Your profile could not be found.';
  if (status === 400) return 'Invalid input. Please check the fields.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (typeof status === 'number' && status >= 500) return 'The server could not complete the request. Please try again.';

  // Conflict messages from the API are intended for display; never render arbitrary error objects.
  if (status === 409 && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim().slice(0, 200);
  }
  return GENERIC_ERROR;
}

export function isProfileRetryableError(error) {
  return Boolean(error && typeof error === 'object'
    && (error.status === 0 || error.code === 'NETWORK_ERROR' || error.timedOut === true
      || (typeof error.status === 'number' && error.status >= 500)));
}

export function mapProfileValidationDetails(details, allowedFields) {
  const fieldErrors = {};
  let hasUnmappedDetail = false;
  const safeFields = Array.isArray(allowedFields) ? allowedFields : [];

  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail || typeof detail !== 'object' || typeof detail.message !== 'string' || !detail.message.trim()) {
      hasUnmappedDetail = true;
      continue;
    }

    const rootField = typeof detail.field === 'string' ? detail.field.split('.')[0] : '';
    if (safeFields.includes(rootField)) {
      if (!fieldErrors[rootField]) fieldErrors[rootField] = detail.message.trim();
    } else {
      hasUnmappedDetail = true;
    }
  }

  return {
    fieldErrors,
    formError: hasUnmappedDetail ? 'Invalid input. Please check the fields.' : null,
  };
}
