import { Link, NavLink } from 'react-router-dom';
import Message from './Message.jsx';

const USER_LINKS = [
  { to: '/notes', label: 'My Notes' },
  { to: '/profile', label: 'Profile' },
];

const ADMIN_LINKS = [
  ...USER_LINKS,
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/notes', label: 'All Notes' },
  { to: '/admin/interests', label: 'Interests' },
];

function navClassName({ isActive }) {
  return isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link';
}

function safeNotice(notice) {
  if (typeof notice === 'string') return { kind: 'error', message: notice };
  if (!notice || typeof notice !== 'object' || typeof notice.message !== 'string') return null;

  const kind = notice.kind === 'success' ? 'success' : 'error';
  return { kind, message: notice.message };
}

export default function Header({ user = null, notice = null, onLogout, onClearNotice }) {
  const links = user?.role === 'admin' ? ADMIN_LINKS : USER_LINKS;
  const visibleNotice = safeNotice(notice);
  const displayName = [user?.name, user?.email].find((value) => typeof value === 'string' && value.trim())
    ?? (user ? 'Signed in' : '');

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="site-brand" to={user ? '/notes' : '/login'}>
          Secure Notes
        </Link>

        <nav className="site-nav" aria-label="Main navigation">
          {user ? links.map((link) => (
            <NavLink key={link.to} className={navClassName} to={link.to}>
              {link.label}
            </NavLink>
          )) : (
            <>
              <NavLink className={navClassName} to="/login">Login</NavLink>
              <NavLink className={navClassName} to="/register">Register</NavLink>
            </>
          )}
        </nav>

        {user && (
          <div className="site-header__account">
            <span className="site-header__name">{displayName}</span>
            <span className="role-badge">{user.role === 'admin' ? 'Admin' : 'User'}</span>
            <button
              className="button--secondary site-header__logout"
              type="button"
              disabled={typeof onLogout !== 'function'}
              onClick={onLogout}
            >
              Log out
            </button>
          </div>
        )}
      </div>

      {visibleNotice && (
        <div className="container site-header__notice">
          <Message
            kind={visibleNotice.kind}
            message={visibleNotice.message}
            onDismiss={onClearNotice}
            compact
          />
        </div>
      )}
    </header>
  );
}
