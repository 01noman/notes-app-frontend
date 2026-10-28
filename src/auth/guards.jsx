import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { getGuardDecision } from './session.js';

function RouteGuard({ mode, children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const from = {
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  };
  const decision = getGuardDecision({ status, user, mode, from });

  if (decision.type === 'loading') {
    return <main className="container" role="status">Loading…</main>;
  }

  if (decision.type === 'redirect') {
    return <Navigate to={decision.to} replace={decision.replace} state={decision.state} />;
  }

  if (decision.type === 'forbidden') {
    return (
      <main className="container">
        <section role="alert" aria-labelledby="forbidden-heading">
          <h1 id="forbidden-heading">Forbidden</h1>
          <p>You don't have access to this page.</p>
        </section>
      </main>
    );
  }

  return children ?? <Outlet />;
}

export function RequireAuth({ children }) {
  return <RouteGuard mode="auth">{children}</RouteGuard>;
}

export function RequireAdmin({ children }) {
  return <RouteGuard mode="admin">{children}</RouteGuard>;
}

export function AnonymousOnly({ children }) {
  return <RouteGuard mode="anonymous">{children}</RouteGuard>;
}
