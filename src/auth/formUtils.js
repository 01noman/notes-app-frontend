const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_GENERIC_ERROR = 'Something went wrong. Please try again.';
const FIELD_VALIDATION_ERROR = 'Invalid input. Please check the fields.';

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

export function parseInterests(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map((interest) => interest.trim().toLowerCase()).filter(Boolean))];
}

export function validateLogin(form = {}) {
  const errors = {};
  const email = stringValue(form.email).trim();
  const password = stringValue(form.password);

  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  return errors;
}

export function validateRegister(form = {}) {
  const errors = {};
  const name = stringValue(form.name).trim();
  const email = stringValue(form.email).trim();
  const password = stringValue(form.password);
  const interests = parseInterests(form.interests);

  if (!name) errors.name = 'Name is required.';
  else if (name.length > 80) errors.name = 'Name must be at most 80 characters.';

  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  else if (email.length > 254) errors.email = 'Email must be at most 254 characters.';

  if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (new TextEncoder().encode(password).length > 72) errors.password = 'Password must be at most 72 bytes.';

  if (interests.length > 10) errors.interests = 'Enter no more than 10 interests.';
  else if (interests.some((interest) => interest.length > 30)) {
    errors.interests = 'Each interest must be at most 30 characters.';
  }

  return errors;
}

/** Map backend validation details only to fields known by this form. */
export function mapValidationDetails(details, allowedFields = []) {
  const fieldErrors = {};
  let hasUnmappedDetail = false;

  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail || typeof detail !== 'object' || typeof detail.message !== 'string' || !detail.message.trim()) {
      hasUnmappedDetail = true;
      continue;
    }

    const field = typeof detail.field === 'string' ? detail.field : '';
    const rootField = field.split('.')[0];
    if (allowedFields.includes(rootField)) {
      if (!fieldErrors[rootField]) fieldErrors[rootField] = detail.message.trim();
    } else {
      hasUnmappedDetail = true;
    }
  }

  return {
    fieldErrors,
    formError: hasUnmappedDetail ? FIELD_VALIDATION_ERROR : null,
  };
}

export function getAuthErrorMessage(error, mode) {
  if (!error || typeof error !== 'object') return AUTH_GENERIC_ERROR;

  if (mode === 'login' && error.status === 401) return 'Invalid email or password.';
  if (mode === 'register' && error.status === 409) return 'Email already registered.';
  if (error.status === 429) return 'Too many attempts. Try again later.';
  if (error.status === 400) return FIELD_VALIDATION_ERROR;
  if (error.status === 0 || error.code === 'NETWORK_ERROR' || error.timedOut === true) return 'Cannot reach server.';
  if (typeof error.status === 'number' && error.status >= 500) {
    return 'The server could not complete the request. Please try again.';
  }
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  return AUTH_GENERIC_ERROR;
}
