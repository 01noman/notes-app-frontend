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

/** Pure decision logic shared by route guards and tests. */
export function getGuardDecision({ status, user, mode = 'auth', from }) {
  if (status === 'verifying') return { type: 'loading' };

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
