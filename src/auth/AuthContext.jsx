import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, clearStoredToken, readStoredToken, setUnauthorizedHandler, storeToken } from '../api/client.js';
import { authReducer, classifyVerificationError, createInitialAuthState } from './session.js';

const AuthContext = createContext(null);
const SESSION_EXPIRED_NOTICE = 'Session expired. Please log in again.';
// A sleeping free-tier host can need up to ~60 s to wake; allow for it when checking a stored session.
const VERIFY_TIMEOUT_MS = 45_000;

function safeDestination(destination) {
  if (typeof destination === 'string') {
    return destination.startsWith('/') && !destination.startsWith('//') ? destination : '/notes';
  }

  if (destination && typeof destination.pathname === 'string'
    && destination.pathname.startsWith('/') && !destination.pathname.startsWith('//')) {
    return {
      pathname: destination.pathname,
      search: typeof destination.search === 'string' ? destination.search : '',
      hash: typeof destination.hash === 'string' ? destination.hash : '',
    };
  }

  return '/notes';
}

function extractSession(payload) {
  const user = payload?.data?.user;
  if (typeof payload?.token !== 'string' || !payload.token || !user || typeof user._id !== 'string' || !user.role) {
    throw new Error('The server returned an invalid authentication response. Please try again.');
  }
  return { token: payload.token, user };
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(authReducer, undefined, () => createInitialAuthState(Boolean(readStoredToken())));

  const handleUnauthorized = useCallback(() => {
    clearStoredToken();
    dispatch({ type: 'SIGNED_OUT', notice: SESSION_EXPIRED_NOTICE });
    navigate('/login', { replace: true, state: { sessionExpired: true } });
  }, [navigate]);

  useEffect(() => setUnauthorizedHandler(handleUnauthorized), [handleUnauthorized]);

  useEffect(() => {
    if (state.status !== 'verifying') return undefined;

    const controller = new AbortController();
    let active = true;

    apiRequest('users/me', { signal: controller.signal, timeoutMs: VERIFY_TIMEOUT_MS })
      .then((payload) => {
        if (!active) return;
        const user = payload?.data?.user;
        if (!user || typeof user._id !== 'string' || !user.role) {
          throw new Error('The server returned an invalid session response.');
        }
        dispatch({ type: 'SESSION_VERIFIED', user });
      })
      .catch((error) => {
        if (!active) return;
        const kind = classifyVerificationError(error);
        // The API client already ran the central handler for 401 responses.
        if (kind === 'unauthorized') return;
        if (kind === 'unavailable') {
          // Server asleep or unreachable: keep the token and offer a retry instead of logging the user out.
          dispatch({ type: 'SESSION_UNAVAILABLE' });
          return;
        }
        clearStoredToken();
        dispatch({ type: 'SESSION_FAILED' });
        navigate('/login', { replace: true });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [state.status, navigate]);

  const establishSession = useCallback(async (endpoint, credentials, destination) => {
    const payload = await apiRequest(endpoint, { method: 'POST', body: credentials, auth: false });
    const session = extractSession(payload);
    storeToken(session.token);
    dispatch({ type: 'SIGNED_IN', user: session.user });
    navigate(safeDestination(destination ?? '/notes'), { replace: true });
    return session.user;
  }, [navigate]);

  const login = useCallback((credentials, destination) => (
    establishSession('auth/login', credentials, destination)
  ), [establishSession]);

  const register = useCallback((details, destination) => (
    establishSession('auth/register', details, destination)
  ), [establishSession]);

  const logout = useCallback(() => {
    clearStoredToken();
    dispatch({ type: 'SIGNED_OUT' });
    navigate('/login', { replace: true });
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    const payload = await apiRequest('users/me');
    const user = payload?.data?.user;
    if (!user || typeof user._id !== 'string' || !user.role) {
      throw new Error('The server returned an invalid profile response.');
    }
    dispatch({ type: 'USER_UPDATED', user });
    return user;
  }, []);

  const updateAuthenticatedUser = useCallback((user) => {
    if (user && typeof user._id === 'string' && user.role) {
      dispatch({ type: 'USER_UPDATED', user });
    }
  }, []);

  const clearNotice = useCallback(() => dispatch({ type: 'CLEAR_NOTICE' }), []);
  const retryVerification = useCallback(() => dispatch({ type: 'VERIFY_RETRY' }), []);

  const value = useMemo(() => ({
    status: state.status,
    user: state.user,
    notice: state.notice,
    login,
    register,
    logout,
    refreshUser,
    updateAuthenticatedUser,
    clearNotice,
    retryVerification,
  }), [state, login, register, logout, refreshUser, updateAuthenticatedUser, clearNotice, retryVerification]);


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
