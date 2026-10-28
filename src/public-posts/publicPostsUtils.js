const PAGE_SIZES = new Set([10, 25, 50]);
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const INVALID_RESPONSE = 'The server returned an invalid public posts response.';

function isValidPagination(pagination) {
  if (!pagination || typeof pagination !== 'object') return false;
  const { page, limit, total, totalPages } = pagination;
  return Number.isInteger(page) && page >= 1
    && Number.isInteger(limit) && limit >= 1 && limit <= 50
    && Number.isInteger(total) && total >= 0
    && Number.isInteger(totalPages) && totalPages >= 0
    && totalPages === Math.ceil(total / limit);
}

/** Validate the public endpoint envelope and copy only explicitly public fields. */
export function normalizePublicPostsResponse(payload, expectedUserId) {
  const user = payload?.data?.user;
  const posts = payload?.data?.posts;
  const pagination = payload?.pagination;
  const hasValidUser = user && typeof user === 'object'
    && typeof user._id === 'string' && user._id.length > 0
    && typeof user.name === 'string' && user.name.trim().length > 0
    && typeof expectedUserId === 'string' && expectedUserId.length > 0
    && user._id.toLowerCase() === expectedUserId.toLowerCase();

  if (!hasValidUser || !Array.isArray(posts) || !isValidPagination(pagination)) {
    throw new Error(INVALID_RESPONSE);
  }

  const validPosts = posts.every((post) => post && typeof post === 'object'
    && typeof post._id === 'string' && post._id.length > 0
    && typeof post.title === 'string'
    && typeof post.body === 'string'
    && typeof post.createdAt === 'string' && !Number.isNaN(Date.parse(post.createdAt)));

  if (!validPosts || posts.length > pagination.limit) {
    throw new Error(INVALID_RESPONSE);
  }

  return {
    user: { _id: user._id, name: user.name },
    posts: posts.map((post) => ({
      _id: post._id,
      title: post.title,
      body: post.body,
      createdAt: post.createdAt,
    })),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages,
    },
  };
}

/** Clamp a stale or out-of-range page to the last page the response says exists. */
export function resolvePublicPostsPage(requestedPage, pagination) {
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const totalPages = Number.isInteger(pagination?.totalPages) && pagination.totalPages > 0
    ? pagination.totalPages
    : 1;
  return Math.min(page, totalPages);
}

/** Build a public request independently of any stored login token. */
export function buildPublicPostsRequest(userId, page, limit) {
  const id = typeof userId === 'string' ? userId.trim() : '';
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeLimit = PAGE_SIZES.has(limit) ? limit : 10;
  const query = new URLSearchParams({ page: String(safePage), limit: String(safeLimit) });

  return {
    path: `users/${encodeURIComponent(id)}/posts?${query.toString()}`,
    options: { auth: false },
  };
}

/** Convert known status/network failures to contextual messages; never show raw payloads. */
export function getPublicPostsErrorMessage(error) {
  if (!error || typeof error !== 'object') return GENERIC_ERROR;
  const status = error.status;

  if (status === 400 || status === 404) return 'User not found.';
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return "You don't have access to this page.";
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status === 0 || error.code === 'NETWORK_ERROR' || error.timedOut === true) {
    return 'Cannot reach server. It may be waking up (up to 60 seconds); please retry.';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'The server could not complete the request. Please try again.';
  }
  return GENERIC_ERROR;
}

export function isRetryablePublicPostsError(error) {
  return Boolean(error && typeof error === 'object' && (
    error.status === 0
    || error.code === 'NETWORK_ERROR'
    || error.timedOut === true
    || (typeof error.status === 'number' && error.status >= 500)
  ));
}
