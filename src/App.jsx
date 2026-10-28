import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { AnonymousOnly, RequireAdmin, RequireAuth } from './auth/guards.jsx';
import Header from './components/Header.jsx';
import AdminInterests from './pages/AdminInterests.jsx';
import AdminNotes from './pages/AdminNotes.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Notes from './pages/Notes.jsx';
import Profile from './pages/Profile.jsx';
import Register from './pages/Register.jsx';
import UserPosts from './pages/UserPosts.jsx';

export const APP_PATHS = Object.freeze({
  home: '/',
  login: '/login',
  register: '/register',
  notes: '/notes',
  profile: '/profile',
  publicPosts: '/users/:id/posts',
  adminUsers: '/admin/users',
  adminNotes: '/admin/notes',
  adminInterests: '/admin/interests',
  notFound: '*',
});

function AppLayout() {
  const { status, user, notice, logout, clearNotice } = useAuth();

  // Match the session state machine: don't flash the anonymous header while a
  // stored token is being verified on application boot.
  if (status === 'verifying') {
    return <main className="container" role="status" aria-live="polite">Loading…</main>;
  }

  return (
    <>
      <Header
        user={user}
        notice={notice}
        onLogout={logout}
        onClearNotice={clearNotice}
      />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={APP_PATHS.home} element={<Navigate to={APP_PATHS.notes} replace />} />

        <Route
          path={APP_PATHS.login}
          element={<AnonymousOnly><Login /></AnonymousOnly>}
        />
        <Route
          path={APP_PATHS.register}
          element={<AnonymousOnly><Register /></AnonymousOnly>}
        />

        {/* Public by design; this page fetches only public user/post fields. */}
        <Route path={APP_PATHS.publicPosts} element={<UserPosts />} />

        <Route element={<RequireAuth />}>
          <Route path={APP_PATHS.notes} element={<Notes />} />
          <Route path={APP_PATHS.profile} element={<Profile />} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path={APP_PATHS.adminUsers} element={<AdminUsers />} />
          <Route path={APP_PATHS.adminNotes} element={<AdminNotes />} />
          <Route path={APP_PATHS.adminInterests} element={<AdminInterests />} />
        </Route>

        <Route path={APP_PATHS.notFound} element={<NotFound />} />
      </Route>
    </Routes>
  );
}
