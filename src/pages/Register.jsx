import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  getAuthErrorMessage,
  mapValidationDetails,
  parseInterests,
  validateRegister,
} from '../auth/formUtils.js';
import Message from '../components/Message.jsx';

const FIELDS = ['name', 'email', 'password', 'interests'];

export default function Register() {
  const { register, notice, clearNotice } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', interests: '' });
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

    const errors = validateRegister(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        interests: parseInterests(form.interests),
      }, '/notes');
    } catch (error) {
      const mapped = mapValidationDetails(error?.details, FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError ?? (Object.keys(mapped.fieldErrors).length ? null : getAuthErrorMessage(error, 'register')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container auth-page">
      <section className="auth-card" aria-labelledby="register-heading">
        <h1 id="register-heading">Create account</h1>
        {notice && <Message kind="error" message={notice} compact />}
        {formError && <Message kind="error" message={formError} compact />}

        <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
          <div className="form-field">
            <label htmlFor="register-name">Name</label>
            <input
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={80}
              required
              value={form.name}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'register-name-error' : undefined}
            />
            {fieldErrors.name && <p id="register-name-error" className="field-error">{fieldErrors.name}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={form.email}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
            />
            {fieldErrors.email && <p id="register-email-error" className="field-error">{fieldErrors.email}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'register-password-error' : 'register-password-hint'}
            />
            {fieldErrors.password
              ? <p id="register-password-error" className="field-error">{fieldErrors.password}</p>
              : <p id="register-password-hint" className="form-field__hint">Use at least 8 characters.</p>}
          </div>

          <div className="form-field">
            <label htmlFor="register-interests">Interests (optional)</label>
            <input
              id="register-interests"
              name="interests"
              type="text"
              autoComplete="off"
              placeholder="reading, chess, music"
              value={form.interests}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.interests)}
              aria-describedby={fieldErrors.interests ? 'register-interests-error' : 'register-interests-hint'}
            />
            {fieldErrors.interests
              ? <p id="register-interests-error" className="field-error">{fieldErrors.interests}</p>
              : <p id="register-interests-hint" className="form-field__hint">Separate interests with commas; enter up to 10.</p>}
          </div>

          <button className="button--primary auth-form__submit" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-form__footer">Already have an account? <Link to="/login">Log in</Link></p>
      </section>
    </main>
  );
}
