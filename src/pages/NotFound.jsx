import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="container auth-page">
      <section className="auth-card" aria-labelledby="not-found-heading">
        <h1 id="not-found-heading">Page not found</h1>
        <p>The address may be incorrect, or the page may have moved.</p>
        <p className="auth-form__footer">
          <Link to="/">Return home</Link>
          {' · '}
          <Link to="/login">Log in</Link>
        </p>
      </section>
    </main>
  );
}
