export function createInitialAuthState(hasStoredToken) {
  return {
    status: hasStoredToken ? 'verifying' : 'anonymous',
    user: null,
    notice: null,
  };
}

export function authReducer(state, action) {
  switch (action.type) {
    case 'SESSION_VERIFIED':
    case 'SIGNED_IN':
      return { status: 'authenticated', user: action.user, notice: null };
    case 'SESSION_UNAVAILABLE':
      // The server could not be reached while verifying: keep the stored token and let the user retry.
      return state.status === 'verifying' ? { status: 'unavailable', user: null, notice: null } : state;
    case 'VERIFY_RETRY':
      return state.status === 'unavailable' ? { status: 'verifying', user: null, notice: null } : state;
    case 'SESSION_FAILED':
      return { status: 'anonymous', user: null, notice: action.notice ?? null };
    case 'SIGNED_OUT':
      return { status: 'anonymous', user: null, notice: action.notice ?? null };
    case 'USER_UPDATED':
      return state.status === 'authenticated'
        ? { ...state, user: action.user }
        : state;
    case 'CLEAR_NOTICE':
      return state.notice === null ? state : { ...state, notice: null };
    default:
      return state;
  }
}

/**
 * Decide what boot verification should do with a failed GET /users/me:
 *  - 'unauthorized': 401 — the API client already cleared the token and signed the user out.
 *  - 'unavailable': network failure, timeout or 5xx — the token may still be valid, so keep it.
 *  - 'invalid': any other response (bad shape, 4xx) — the stored session cannot be used.
 */
export function classifyVerificationError(error) {
  if (error?.status === 401) return 'unauthorized';
  const network = error?.status === 0 || error?.timedOut === true || error?.code === 'NETWORK_ERROR';
  if (network || (typeof error?.status === 'number' && error.status >= 500)) return 'unavailable';
  return 'invalid';
}

/** Pure decision logic shared by route guards and tests. */
export function getGuardDecision({ status, user, mode = 'auth', from }) {
  if (status === 'verifying' || status === 'unavailable') return { type: 'loading' };

  if (mode === 'anonymous') {
    return status === 'authenticated'
      ? { type: 'redirect', to: '/notes', replace: true }
      : { type: 'allow' };
  }

  if (status !== 'authenticated') {
    const decision = { type: 'redirect', to: '/login', replace: true };
    if (from) decision.state = { from };
    return decision;
  }

  if (mode === 'admin' && user?.role !== 'admin') return { type: 'forbidden' };
  return { type: 'allow' };
}
