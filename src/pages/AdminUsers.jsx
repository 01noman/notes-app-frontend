import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Message from '../components/Message.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  buildAdminUserPayload,
  buildAdminUsersRequest,
  isCurrentAdminUser,
  canChangeAdminUserRole,
  canDeleteAdminUser,
  getAdminUsersErrorMessage,
  isAdminUsersRetryableError,
  mapAdminUserValidationDetails,
  normalizeAdminUserResponse,
  normalizeAdminUsersResponse,
  resolveAdminUsersPage,
  validateAdminUserForm,
} from '../admin-users/adminUsersUtils.js';

const PAGE_SIZES = [10, 25, 50];
const EMPTY_CREATE_FORM = Object.freeze({ name: '', email: '', password: '', role: 'user', interests: '' });

function interestsToInput(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function formFromUser(user) {
  return {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    interests: interestsToInput(user.interests),
  };
}

function formatCreatedAt(value) {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function UserFormFields({
  prefix,
  form,
  errors,
  onChange,
  busy,
  mode,
  roleDisabled = false,
}) {
  const passwordOptional = mode === 'edit';
  return (
    <>
      <div className="form-field">
        <label htmlFor={`${prefix}-name`}>Name</label>
        <input
          id={`${prefix}-name`}
          name="name"
          type="text"
          autoComplete="name"
          maxLength={80}
          required
          value={form.name}
          onChange={onChange}
          disabled={busy}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${prefix}-name-error` : undefined}
        />
        {errors.name && <p className="field-error" id={`${prefix}-name-error`}>{errors.name}</p>}
      </div>
      <div className="form-field">
        <label htmlFor={`${prefix}-email`}>Email</label>
        <input
          id={`${prefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={form.email}
          onChange={onChange}
          disabled={busy}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? `${prefix}-email-error` : undefined}
        />
        {errors.email && <p className="field-error" id={`${prefix}-email-error`}>{errors.email}</p>}
      </div>
      <div className="form-field">
        <label htmlFor={`${prefix}-password`}>{passwordOptional ? 'New password (optional)' : 'Password'}</label>
        <input
          id={`${prefix}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required={!passwordOptional}
          placeholder={passwordOptional ? 'Leave blank to keep current password' : undefined}
          value={form.password}
          onChange={onChange}
          disabled={busy}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? `${prefix}-password-error` : `${prefix}-password-hint`}
        />
        {errors.password
          ? <p className="field-error" id={`${prefix}-password-error`}>{errors.password}</p>
          : <p className="form-field__hint" id={`${prefix}-password-hint`}>At least 8 characters and no more than 72 UTF-8 bytes.</p>}
      </div>
      <div className="form-field">
        <label htmlFor={`${prefix}-role`}>Role</label>
        <select
          id={`${prefix}-role`}
          name="role"
          value={form.role}
          onChange={onChange}
          disabled={busy || roleDisabled}
          aria-invalid={Boolean(errors.role)}
          aria-describedby={errors.role ? `${prefix}-role-error` : undefined}
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        {roleDisabled && <p className="form-field__hint">You cannot change your own role.</p>}
        {errors.role && <p className="field-error" id={`${prefix}-role-error`}>{errors.role}</p>}
      </div>
      <div className="form-field">
        <label htmlFor={`${prefix}-interests`}>Interests (optional)</label>
        <input
          id={`${prefix}-interests`}
          name="interests"
          type="text"
          autoComplete="off"
          placeholder="reading, chess, music"
          value={form.interests}
          onChange={onChange}
          disabled={busy}
          aria-invalid={Boolean(errors.interests)}
          aria-describedby={errors.interests ? `${prefix}-interests-error` : `${prefix}-interests-hint`}
        />
        {errors.interests
          ? <p className="field-error" id={`${prefix}-interests-error`}>{errors.interests}</p>
          : <p className="form-field__hint" id={`${prefix}-interests-hint`}>Comma-separated; up to 10 interests, each at most 30 characters.</p>}
      </div>
    </>
  );
}

export default function AdminUsers() {
  const { user: currentUser, refreshUser } = useAuth();
  const currentUserId = typeof currentUser?._id === 'string' ? currentUser._id : '';
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [listState, setListState] = useState('loading');
  const [listError, setListError] = useState('');
  const [listForbidden, setListForbidden] = useState(false);
  const [listRetry, setListRetry] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestSequence = useRef(0);
  const editRequestSequence = useRef(0);

  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [createErrors, setCreateErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [createRetry, setCreateRetry] = useState(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [loadingEditId, setLoadingEditId] = useState(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_CREATE_FORM });
  const [editErrors, setEditErrors] = useState({});
  const [editError, setEditError] = useState('');
  const [editRetry, setEditRetry] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pageMessage, setPageMessage] = useState(null);
  const [pageMessageRetry, setPageMessageRetry] = useState(null);

  const loadUsers = useCallback(async (requestedPage, requestedLimit, signal) => {
    const sequence = ++requestSequence.current;
    setListState('loading');
    setListError('');
    setListForbidden(false);
    setListRetry(null);
    try {
      const payload = await apiRequest(buildAdminUsersRequest(requestedPage, requestedLimit), { signal });
      const result = normalizeAdminUsersResponse(payload);
      if (sequence !== requestSequence.current) return;

      const validPage = resolveAdminUsersPage(requestedPage, result.pagination);
      if (validPage !== requestedPage) {
        setPage(validPage);
        return;
      }

      setUsers(result.users);
      setPagination(result.pagination);
      setListState(result.users.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (sequence !== requestSequence.current || signal?.aborted) return;
      setListError(getAdminUsersErrorMessage(error, 'load'));
      setListForbidden(error?.status === 403);
      setListState('error');
      if (isAdminUsersRetryableError(error)) {
        setListRetry(() => () => setRetryCount((value) => value + 1));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(page, limit, controller.signal);
    return () => {
      controller.abort();
      requestSequence.current += 1;
    };
  }, [loadUsers, page, limit, retryCount]);

  function clearPageMessage() {
    setPageMessage(null);
    setPageMessageRetry(null);
  }

  function handleCreateChange(event) {
    const { name, value } = event.currentTarget;
    setCreateForm((current) => ({ ...current, [name]: value }));
    setCreateErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setCreateError('');
    setCreateRetry(null);
    clearPageMessage();
  }

  async function handleCreateSubmit(event) {
    event?.preventDefault?.();
    setCreateError('');
    setCreateRetry(null);
    clearPageMessage();
    const errors = validateAdminUserForm(createForm, 'create');
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreating(true);
    try {
      const payload = await apiRequest('users', {
        method: 'POST',
        body: buildAdminUserPayload(createForm, 'create'),
      });
      normalizeAdminUserResponse(payload);
      setCreateForm({ ...EMPTY_CREATE_FORM });
      setCreateErrors({});
      setPageMessage({ kind: 'success', message: 'User added.' });
      if (page !== 1) setPage(1);
      else setRetryCount((value) => value + 1);
    } catch (error) {
      const mapped = mapAdminUserValidationDetails(error?.details);
      setCreateErrors(mapped.fieldErrors);
      const hasFieldErrors = Object.keys(mapped.fieldErrors).length > 0;
      setCreateError(mapped.formError ?? (hasFieldErrors ? '' : getAdminUsersErrorMessage(error, 'create')));
      if (isAdminUsersRetryableError(error)) setCreateRetry(() => () => { void handleCreateSubmit(); });
    } finally {
      setCreating(false);
    }
  }

  function startEdit(target) {
    const sequence = ++editRequestSequence.current;
    setEditingId(target._id);
    setLoadingEditId(target._id);
    setEditForm(formFromUser(target));
    setEditErrors({});
    setEditError('');
    setEditRetry(null);
    clearPageMessage();

    // Fetch the selected user through GET /users/:id rather than relying only on the list row.
    void (async () => {
      try {
        const payload = await apiRequest(`users/${encodeURIComponent(target._id)}`);
        const detail = normalizeAdminUserResponse(payload, target._id);
        if (sequence !== editRequestSequence.current) return;
        setEditForm(formFromUser(detail));
      } catch (error) {
        if (sequence !== editRequestSequence.current) return;
        setEditError(getAdminUsersErrorMessage(error, 'edit'));
        if (isAdminUsersRetryableError(error)) {
          setEditRetry(() => () => startEdit(target));
        }
        if (error?.status === 404) setRetryCount((value) => value + 1);
      } finally {
        if (sequence === editRequestSequence.current) setLoadingEditId(null);
      }
    })();
  }

  function cancelEdit() {
    editRequestSequence.current += 1;
    setEditingId(null);
    setLoadingEditId(null);
    setEditForm({ ...EMPTY_CREATE_FORM });
    setEditErrors({});
    setEditError('');
    setEditRetry(null);
  }

  function handleEditChange(event) {
    const { name, value } = event.currentTarget;
    setEditForm((current) => ({ ...current, [name]: value }));
    setEditErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setEditError('');
    setEditRetry(null);
    clearPageMessage();
  }

  async function handleEditSubmit(event) {
    event?.preventDefault?.();
    if (!editingId) return;
    setEditError('');
    setEditRetry(null);
    clearPageMessage();
    const errors = validateAdminUserForm(editForm, 'edit');
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const targetId = editingId;
    setSavingEdit(true);
    try {
      const payload = await apiRequest(`users/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        body: buildAdminUserPayload(editForm, 'edit'),
      });
      normalizeAdminUserResponse(payload, targetId);
      // Editing your own account must update the name/email shown in the header.
      if (isCurrentAdminUser(currentUserId, targetId)) void refreshUser().catch(() => {});
      cancelEdit();
      setPageMessage({ kind: 'success', message: 'User updated.' });
      setRetryCount((value) => value + 1);
    } catch (error) {
      if (error?.status === 404) setRetryCount((value) => value + 1);
      const mapped = mapAdminUserValidationDetails(error?.details);
      setEditErrors(mapped.fieldErrors);
      const hasFieldErrors = Object.keys(mapped.fieldErrors).length > 0;
      setEditError(mapped.formError ?? (hasFieldErrors ? '' : getAdminUsersErrorMessage(error, 'edit')));
      if (isAdminUsersRetryableError(error)) setEditRetry(() => () => { void handleEditSubmit(); });
    } finally {
      setSavingEdit(false);
    }
  }

  async function performDelete(target, requireConfirmation = true) {
    if (!canDeleteAdminUser(currentUserId, target._id) || deletingId) return;
    if (requireConfirmation) {
      const confirmed = typeof window !== 'undefined'
        && typeof window.confirm === 'function'
        && window.confirm("Delete this user? This also deletes the user's notes and posts.");
      if (!confirmed) return;
    }

    clearPageMessage();
    setDeletingId(target._id);
    try {
      await apiRequest(`users/${encodeURIComponent(target._id)}`, { method: 'DELETE' });
      if (editingId === target._id) cancelEdit();
      setPageMessage({ kind: 'success', message: 'User deleted.' });
      setRetryCount((value) => value + 1);
    } catch (error) {
      setPageMessage({ kind: 'error', message: getAdminUsersErrorMessage(error, 'delete') });
      if (isAdminUsersRetryableError(error)) {
        setPageMessageRetry(() => () => { void performDelete(target, false); });
      }
      if (error?.status === 404) setRetryCount((value) => value + 1);
    } finally {
      setDeletingId(null);
    }
  }

  function handlePageChange(nextPage) {
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === page || listState === 'loading') return;
    setPage(nextPage);
  }

  function handleLimitChange(event) {
    const nextLimit = Number(event.currentTarget.value);
    if (!PAGE_SIZES.includes(nextLimit) || nextLimit === limit) return;
    setLimit(nextLimit);
    setPage(1);
  }

  if (listForbidden) {
    return (
      <main className="container admin-users-page">
        <h1>Users</h1>
        <Message kind="error" message={listError || "You don't have access to this page."} />
      </main>
    );
  }

  return (
    <main className="container admin-users-page">
      <h1>Users</h1>
      {pageMessage && (
        <Message
          kind={pageMessage.kind}
          message={pageMessage.message}
          onRetry={pageMessageRetry ?? undefined}
          compact
        />
      )}

      <section className="admin-users-section" aria-labelledby="admin-users-create-heading">
        <h2 id="admin-users-create-heading">Add user</h2>
        {createError && (
          <Message kind="error" message={createError} onRetry={createRetry ?? undefined} compact />
        )}
        <form className="admin-user-form" onSubmit={handleCreateSubmit} noValidate aria-busy={creating}>
          <UserFormFields
            prefix="admin-create"
            form={createForm}
            errors={createErrors}
            onChange={handleCreateChange}
            busy={creating}
            mode="create"
          />
          <div className="admin-user-form__actions">
            <button className="button--primary" type="submit" disabled={creating}>
              {creating ? 'Adding…' : 'Add user'}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-users-section" aria-labelledby="admin-users-list-heading">
        <div className="admin-users-section__heading">
          <h2 id="admin-users-list-heading">All users</h2>
          <label className="admin-users-page-size" htmlFor="admin-users-limit">
            Users per page
            <select id="admin-users-limit" value={limit} onChange={handleLimitChange} disabled={listState === 'loading'}>
              {PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
            </select>
          </label>
        </div>

        {listState === 'loading' && <Message kind="loading" message="Loading users…" />}
        {listState === 'error' && (
          <Message kind="error" message={listError} onRetry={listRetry ?? undefined} />
        )}
        {listState === 'empty' && <Message kind="empty" message="No users found." />}

        {listState === 'success' && (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Interests</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((target) => {
                  const isSelf = Boolean(currentUserId) && target._id.toLowerCase() === currentUserId.toLowerCase();
                  if (editingId === target._id) {
                    return (
                      <tr className="admin-users-table__edit-row" key={`${target._id}-edit`}>
                        <td colSpan={6}>
                          <form className="admin-user-form admin-user-form--edit" onSubmit={handleEditSubmit} noValidate aria-busy={savingEdit || loadingEditId === target._id}>
                            <h3>Edit {target.name}</h3>
                            {loadingEditId === target._id && <Message kind="loading" message="Loading user profile…" compact />}
                            {editError && <Message kind="error" message={editError} onRetry={editRetry ?? undefined} compact />}
                            <UserFormFields
                              prefix={`admin-edit-${target._id}`}
                              form={editForm}
                              errors={editErrors}
                              onChange={handleEditChange}
                              busy={savingEdit || loadingEditId === target._id}
                              mode="edit"
                              roleDisabled={!canChangeAdminUserRole(currentUserId, target._id)}
                            />
                            <div className="admin-user-form__actions">
                              <button className="button--primary" type="submit" disabled={savingEdit || loadingEditId === target._id}>
                                {savingEdit ? 'Saving…' : 'Save changes'}
                              </button>
                              <button className="button--secondary" type="button" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={target._id}>
                      <td>{target.name}</td>
                      <td>{target.email}</td>
                      <td><span className="admin-users-role">{target.role}</span></td>
                      <td>{target.interests.length ? target.interests.join(', ') : '—'}</td>
                      <td>{formatCreatedAt(target.createdAt)}</td>
                      <td>
                        <div className="admin-users-actions">
                          <Link className="admin-users-action-link" to={`/users/${encodeURIComponent(target._id)}/posts`}>Posts</Link>
                          <button className="button--secondary" type="button" onClick={() => startEdit(target)} disabled={Boolean(deletingId) || savingEdit || Boolean(loadingEditId)}>{loadingEditId === target._id ? 'Loading…' : 'Edit'}</button>
                          <button
                            className="button--danger"
                            type="button"
                            onClick={() => { void performDelete(target); }}
                            disabled={!canDeleteAdminUser(currentUserId, target._id) || deletingId === target._id || Boolean(deletingId)}
                            title={isSelf ? 'You cannot delete your own account.' : undefined}
                          >
                            {deletingId === target._id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                        {isSelf && <p className="form-field__hint admin-users-self-hint">Your own account cannot be deleted or demoted.</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          loading={listState === 'loading'}
          onPageChange={handlePageChange}
        />
        {listState === 'success' && (
          <p className="admin-users-total" aria-live="polite">{pagination.total} users (estimated total)</p>
        )}
      </section>
    </main>
  );
}
