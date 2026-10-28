const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 10_000;
const NOTE_FIELDS = new Set(['title', 'content']);

export function validateNoteForm(form = {}) {
  const title = typeof form.title === 'string' ? form.title.trim() : '';
  const content = typeof form.content === 'string' ? form.content : '';
  const errors = {};

  if (!title) errors.title = 'Title is required.';
  else if (title.length > MAX_TITLE_LENGTH) errors.title = 'Title must be at most 120 characters.';

  if (!content.trim()) errors.content = 'Content is required.';
  else if (content.length > MAX_CONTENT_LENGTH) errors.content = 'Content must be at most 10000 characters.';

  return errors;
}

/** Validate the exact { data, pagination } envelope returned by GET /notes. */
export function normalizeNotesResponse(payload) {
  const pagination = payload?.pagination;
  const validPagination = pagination
    && Number.isInteger(pagination.page) && pagination.page >= 1
    && Number.isInteger(pagination.limit) && pagination.limit >= 1
    && Number.isInteger(pagination.total) && pagination.total >= 0
    && Number.isInteger(pagination.totalPages) && pagination.totalPages >= 0
    && pagination.totalPages === Math.ceil(pagination.total / pagination.limit);

  if (!payload || !Array.isArray(payload.data) || !validPagination) {
    throw new Error('The server returned an invalid notes response.');
  }

  const validNotes = payload.data.every((note) => (
    note
    && typeof note === 'object'
    && typeof note._id === 'string'
    && typeof note.title === 'string'
    && typeof note.content === 'string'
  ));

  if (!validNotes) throw new Error('The server returned an invalid notes response.');

  return {
    notes: payload.data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages,
    },
  };
}

/** Clamp a stale page to the final valid page after a deletion or an out-of-range response. */
export function resolveNotesPage(requestedPage, pagination) {
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const totalPages = Number.isInteger(pagination?.totalPages) && pagination.totalPages >= 0
    ? pagination.totalPages
    : 0;

  if (totalPages === 0) return 1;
  return Math.min(page, totalPages);
}

export function isRetryableNotesError(error) {
  return Boolean(error && typeof error === 'object' && (
    error.status === 0
    || error.code === 'NETWORK_ERROR'
    || error.timedOut === true
    || (typeof error.status === 'number' && error.status >= 500)
  ));
}

/** Convert known API failures into brief, user-safe messages. Never expose stack-like payloads. */
export function getNotesErrorMessage(error, action = 'load') {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';

  if (error.status === 404 && ['edit', 'update', 'delete'].includes(action)) {
    return 'Note no longer exists.';
  }
  if (error.status === 400) return 'Invalid input. Please check the fields.';
  if (error.status === 401) return 'Your session has expired. Please log in again.';
  if (error.status === 403) return "You don't have access to this resource.";
  if (error.status === 409) return 'The request conflicts with existing data.';
  if (error.status === 429) return 'Too many requests. Please wait a moment.';
  if (error.status === 0 || error.code === 'NETWORK_ERROR' || error.timedOut === true) {
    return 'Cannot reach server. It may be waking up (up to 60 seconds); please retry.';
  }
  if (typeof error.status === 'number' && error.status >= 500) {
    return 'The server could not complete the request. Please try again.';
  }

  if (typeof error.message === 'string' && error.message.trim() && !/stack|exception|internal server error/i.test(error.message)) {
    return error.message.trim().slice(0, 200);
  }
  return 'Something went wrong. Please try again.';
}

export function mapNoteValidationDetails(details) {
  const fieldErrors = {};
  let hasUnmappedDetail = false;

  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail || typeof detail !== 'object' || typeof detail.message !== 'string' || !detail.message.trim()) {
      hasUnmappedDetail = true;
      continue;
    }

    const field = typeof detail.field === 'string' ? detail.field : '';
    const rootField = field.split('.')[0];
    if (NOTE_FIELDS.has(rootField)) {
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
