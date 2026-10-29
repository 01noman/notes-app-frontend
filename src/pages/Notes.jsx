import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';
import Message from '../components/Message.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  getNotesErrorMessage,
  isRetryableNotesError,
  mapNoteValidationDetails,
  normalizeNotesResponse,
  resolveNotesPage,
  validateNoteForm,
} from '../notes/notesUtils.js';

const EMPTY_FORM = Object.freeze({ title: '', content: '' });
const PAGE_SIZES = [10, 25, 50];

function formatUpdatedAt(value) {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function validSingleNote(note) {
  return note
    && typeof note === 'object'
    && typeof note._id === 'string'
    && typeof note.title === 'string'
    && typeof note.content === 'string';
}

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [listState, setListState] = useState('loading');
  const [listError, setListError] = useState('');
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [formRetry, setFormRetry] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const titleInputRef = useRef(null);
  const requestSequence = useRef(0);
  const focusedEmptyState = useRef(false);

  const loadNotes = useCallback(async (requestedPage, requestedLimit) => {
    const sequence = ++requestSequence.current;
    setListState('loading');
    setListError('');

    try {
      const query = new URLSearchParams({
        page: String(requestedPage),
        limit: String(requestedLimit),
      });
      const payload = await apiRequest(`notes?${query.toString()}`);
      const result = normalizeNotesResponse(payload);

      // Ignore a slower response after the user has navigated to another page or retried.
      if (sequence !== requestSequence.current) return;

      const validPage = resolveNotesPage(requestedPage, result.pagination);
      if (validPage !== requestedPage) {
        // The last row on the last page may have been deleted. Fetch the last valid page instead.
        setPage(validPage);
        return;
      }

      setNotes(result.notes);
      setPagination(result.pagination);
      setListState(result.notes.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setListError(getNotesErrorMessage(error, 'load'));
      setListState('error');
    }
  }, []);

  useEffect(() => {
    void loadNotes(page, limit);
  }, [loadNotes, page, limit]);

  useEffect(() => {
    // Focus the form the first time the list is empty; do not steal focus on every later reload.
    if (listState === 'empty' && !focusedEmptyState.current) {
      focusedEmptyState.current = true;
      titleInputRef.current?.focus();
    }
  }, [listState]);

  function clearActionMessages() {
    setMessage(null);
    setFormError('');
    setFormRetry(null);
  }

  function handleFormChange(event) {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    clearActionMessages();
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFieldErrors({});
    setFormError('');
    setMessage(null);
    setFormRetry(null);
    titleInputRef.current?.focus();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearActionMessages();
    setFormRetry(null);

    const errors = validateNoteForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      titleInputRef.current?.focus();
      return;
    }

    const isEditing = Boolean(editingId);
    const action = isEditing ? 'update' : 'create';
    setSubmitting(true);

    try {
      await apiRequest(
        isEditing ? `notes/${encodeURIComponent(editingId)}` : 'notes',
        {
          method: isEditing ? 'PATCH' : 'POST',
          body: { title: form.title.trim(), content: form.content },
        },
      );

      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      setFieldErrors({});
      setFormError('');
      setFormRetry(null);
      setMessage({ kind: 'success', message: isEditing ? 'Note updated.' : 'Note created.' });

      const destinationPage = isEditing ? page : 1;
      if (destinationPage !== page) setPage(destinationPage);
      else void loadNotes(destinationPage, limit);
    } catch (error) {
      if (error?.status === 404 && isEditing) {
        setEditingId(null);
        setForm({ ...EMPTY_FORM });
        setFieldErrors({});
        setMessage({ kind: 'error', message: 'Note no longer exists.' });
        void loadNotes(page, limit);
        return;
      }

      const mapped = mapNoteValidationDetails(error?.details);
      setFieldErrors(mapped.fieldErrors);
      const hasFieldErrors = Object.keys(mapped.fieldErrors).length > 0;
      setFormError(mapped.formError ?? (hasFieldErrors ? '' : getNotesErrorMessage(error, action)));
      if (isRetryableNotesError(error)) {
        setFormRetry(() => () => {
          void handleSubmit({ preventDefault() {} });
        });
      } else {
        setFormRetry(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(note) {
    clearActionMessages();
    setLoadingEdit(true);

    try {
      const payload = await apiRequest(`notes/${encodeURIComponent(note._id)}`);
      const loadedNote = payload?.data?.note;
      if (!validSingleNote(loadedNote)) throw new Error('The server returned an invalid note response.');

      setEditingId(loadedNote._id);
      setForm({ title: loadedNote.title, content: loadedNote.content });
      setFieldErrors({});
      setFormError('');
      titleInputRef.current?.focus();
    } catch (error) {
      if (error?.status === 404) {
        setMessage({ kind: 'error', message: 'Note no longer exists.' });
        void loadNotes(page, limit);
      } else {
        setMessage({
          kind: 'error',
          message: getNotesErrorMessage(error, 'edit'),
          ...(isRetryableNotesError(error) ? { onRetry: () => { setMessage(null); void handleEdit(note); } } : {}),
        });
      }
    } finally {
      setLoadingEdit(false);
    }
  }

  async function handleDelete(note) {
    if (deletingId || loadingEdit || editingId) return;
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return;
    if (!window.confirm('Delete this note?')) return;

    setMessage(null);
    setDeletingId(note._id);

    try {
      await apiRequest(`notes/${encodeURIComponent(note._id)}`, { method: 'DELETE' });
      setMessage({ kind: 'success', message: 'Note deleted.' });
      await loadNotes(page, limit);
    } catch (error) {
      if (error?.status === 404) {
        setMessage({ kind: 'error', message: 'Note no longer exists.' });
        await loadNotes(page, limit);
      } else {
        setMessage({
          kind: 'error',
          message: getNotesErrorMessage(error, 'delete'),
          ...(isRetryableNotesError(error) ? { onRetry: () => { setMessage(null); void handleDelete(note); } } : {}),
        });
      }
    } finally {
      setDeletingId(null);
    }
  }

  function handlePageChange(nextPage) {
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === page) return;
    setMessage(null);
    setPage(nextPage);
  }

  function handleLimitChange(event) {
    const nextLimit = Number(event.currentTarget.value);
    if (!PAGE_SIZES.includes(nextLimit) || nextLimit === limit) return;
    setMessage(null);
    setLimit(nextLimit);
    setPage(1);
  }

  return (
    <main className="container notes-page">
      <h1>My Notes</h1>

      {message && <Message kind={message.kind} message={message.message} onRetry={message.onRetry} compact />}

      <section className="notes-form-section" aria-labelledby="note-form-heading">
        <h2 id="note-form-heading" className="notes-form__heading">
          {editingId ? 'Edit note' : 'New note'}
        </h2>

        {formError && <Message kind="error" message={formError} onRetry={formRetry ?? undefined} compact />}

        <form className="notes-form" onSubmit={handleSubmit} noValidate aria-busy={submitting || loadingEdit}>
          <div className="form-field">
            <label htmlFor="note-title">Title</label>
            <input
              ref={titleInputRef}
              id="note-title"
              name="title"
              type="text"
              autoComplete="off"
              maxLength={120}
              required
              value={form.title}
              onChange={handleFormChange}
              disabled={submitting || loadingEdit}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={fieldErrors.title ? 'note-title-error' : undefined}
            />
            {fieldErrors.title && <p id="note-title-error" className="field-error">{fieldErrors.title}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="note-content">Content</label>
            <textarea
              id="note-content"
              name="content"
              maxLength={10000}
              required
              value={form.content}
              onChange={handleFormChange}
              disabled={submitting || loadingEdit}
              aria-invalid={Boolean(fieldErrors.content)}
              aria-describedby={fieldErrors.content ? 'note-content-error' : undefined}
            />
            {fieldErrors.content && <p id="note-content-error" className="field-error">{fieldErrors.content}</p>}
          </div>

          <div className="notes-form__actions">
            <button className="button--primary" type="submit" disabled={submitting || loadingEdit}>
              {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Save'}
            </button>
            {editingId && (
              <button className="button--secondary" type="button" onClick={cancelEdit} disabled={submitting || loadingEdit}>
                Cancel
              </button>
            )}
            {loadingEdit && <span className="notes-muted" role="status">Loading note…</span>}
          </div>
        </form>
      </section>

      <section className="notes-list-section" aria-labelledby="notes-list-heading">
        <div className="notes-list-section__heading">
          <h2 id="notes-list-heading">Your notes</h2>
          <div className="notes-page-size">
            <label htmlFor="notes-page-size">Rows per page</label>
            <select id="notes-page-size" value={limit} onChange={handleLimitChange} disabled={listState === 'loading'}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>

        {listState === 'loading' && <Message kind="loading" message="Loading notes…" />}
        {listState === 'empty' && <Message kind="empty" message="You have no notes yet." />}
        {listState === 'error' && (
          <Message
            kind="error"
            message={listError}
            onRetry={() => { setMessage(null); void loadNotes(page, limit); }}
          />
        )}

        {listState === 'success' && (
          <div className="table-wrapper notes-page__table-wrapper">
            <table className="notes-page__table">
              <caption className="visually-hidden">Your notes</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note._id}>
                    <td>
                      <strong className="notes-row-title">{note.title}</strong>
                      <span className="notes-row-id">ID <code title={note._id}>{note._id.slice(-8)}</code></span>
                    </td>
                    <td>{formatUpdatedAt(note.updatedAt ?? note.createdAt)}</td>
                    <td>
                      <div className="notes-row-actions">
                        <button
                          className="button--secondary"
                          type="button"
                          onClick={() => void handleEdit(note)}
                          disabled={Boolean(deletingId) || loadingEdit || submitting || Boolean(editingId)}
                        >
                          Edit
                        </button>
                        <button
                          className="button--danger"
                          type="button"
                          onClick={() => void handleDelete(note)}
                          disabled={Boolean(deletingId) || loadingEdit || submitting || Boolean(editingId)}
                        >
                          {deletingId === note._id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
      </section>
    </main>
  );
}
