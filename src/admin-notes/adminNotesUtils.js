const OBJECT_ID = /^[0-9a-f]{24}$/i;
const PAGE_SIZES = new Set([10, 25, 50]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePagination(value, rowsLength) {
  if (!isRecord(value)) throw new TypeError('Invalid admin notes response.');
  const { page, limit, total, totalPages } = value;
  if (!Number.isInteger(page) || page < 1
    || !Number.isInteger(limit) || !PAGE_SIZES.has(limit)
    || !Number.isInteger(total) || total < 0
    || totalPages !== Math.ceil(total / limit)
    || rowsLength > limit || total < rowsLength) {
    throw new TypeError('Invalid admin notes response.');
  }
  return { page, limit, total, totalPages };
}

export function normalizeAdminNotesResponse(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new TypeError('Invalid admin notes response.');
  }

  const notes = payload.data.map((note) => {
    if (!isRecord(note)
      || typeof note._id !== 'string' || !OBJECT_ID.test(note._id)
      || typeof note.title !== 'string' || note.title.trim() === ''
      || typeof note.owner !== 'string' || !OBJECT_ID.test(note.owner)) {
      throw new TypeError('Invalid admin notes response.');
    }
    const updatedAt = normalizeDate(note.updatedAt);
    if (!updatedAt) throw new TypeError('Invalid admin notes response.');

    // Deliberately project only fields needed by this read-only screen.
    return {
      _id: note._id.toLowerCase(),
      title: note.title,
      owner: note.owner.toLowerCase(),
      updatedAt,
    };
  });

  const pagination = normalizePagination(payload.pagination, notes.length);
  return { notes, pagination };
}

export function validateAdminOwnerFilter(value) {
  const ownerId = typeof value === 'string' ? value.trim() : '';
  if (!ownerId) return null;
  return OBJECT_ID.test(ownerId) ? null : 'Enter a valid 24-character MongoDB user ID.';
}

export function buildAdminNotesRequest(page, limit, ownerId = '') {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be a positive integer');
  if (!Number.isInteger(limit) || !PAGE_SIZES.has(limit)) throw new RangeError('limit must be 10, 25, or 50');
  const normalizedOwner = typeof ownerId === 'string' ? ownerId.trim() : '';
  if (validateAdminOwnerFilter(normalizedOwner)) throw new TypeError('ownerId must be a valid MongoDB user ID');

  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (normalizedOwner) query.set('ownerId', normalizedOwner.toLowerCase());
  return `notes/all?${query.toString()}`;
}

export function resolveAdminNotesPage(requestedPage, pagination) {
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalPages = Number.isInteger(pagination?.totalPages) && pagination.totalPages >= 0
    ? pagination.totalPages
    : 0;
  return Math.min(page, Math.max(1, totalPages));
}

export function getAdminNotesErrorMessage(error) {
  const status = Number(error?.status) || 0;
  const code = typeof error?.code === 'string' ? error.code : '';
  if (status === 403) return "You don't have access to this page.";
  if (status === 400) return 'The request was rejected. Check the owner ID and pagination values.';
  if (status === 401) return 'Your session is no longer valid. Please log in again.';
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status === 0 || error?.timedOut === true || code === 'NETWORK_ERROR') {
    return 'Cannot reach server. It may be waking up; please retry.';
  }
  if (status >= 500) return 'The server could not complete the request. Please try again.';
  return 'Could not load notes. Please try again.';
}

export function isAdminNotesRetryableError(error) {
  const status = Number(error?.status) || 0;
  return status === 0 || error?.timedOut === true || status >= 500;
}
