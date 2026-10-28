import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAuthErrorMessage, mapValidationDetails, validateLogin } from '../auth/formUtils.js';
import Message from '../components/Message.jsx';

const FIELDS = ['email', 'password'];

export default function Login() {
  const location = useLocation();
  const { login, notice, clearNotice } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setFormError(null);
    if (notice) clearNotice();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    clearNotice();

    const errors = validateLogin(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await login({ email: form.email.trim().toLowerCase(), password: form.password }, location.state?.from);
    } catch (error) {
      const mapped = mapValidationDetails(error?.details, FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError ?? (Object.keys(mapped.fieldErrors).length ? null : getAuthErrorMessage(error, 'login')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <h1 id="login-heading">Log in</h1>
        {notice && <Message kind="error" message={notice} compact />}
        {formError && <Message kind="error" message={formError} compact />}

        <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            />
            {fieldErrors.email && <p id="login-email-error" className="field-error">{fieldErrors.email}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            />
            {fieldErrors.password && <p id="login-password-error" className="field-error">{fieldErrors.password}</p>}
          </div>

          <button className="button--primary auth-form__submit" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="auth-form__footer">Don’t have an account? <Link to="/register">Create an account</Link></p>
      </section>
    </main>
  );
}
