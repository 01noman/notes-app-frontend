import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';
import Message from '../components/Message.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  buildAdminNotesRequest,
  getAdminNotesErrorMessage,
  isAdminNotesRetryableError,
  normalizeAdminNotesResponse,
  resolveAdminNotesPage,
  validateAdminOwnerFilter,
} from '../admin-notes/adminNotesUtils.js';

const PAGE_SIZES = [10, 25, 50];
const EMPTY_PAGINATION = Object.freeze({ page: 1, limit: 10, total: 0, totalPages: 0 });

function formatUpdatedAt(value) {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AdminNotes() {
  const [notes, setNotes] = useState([]);
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [ownerInput, setOwnerInput] = useState('');
  const [appliedOwnerId, setAppliedOwnerId] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestSequence = useRef(0);

  const loadNotes = useCallback(async (requestedPage, requestedLimit, ownerId, signal) => {
    const sequence = ++requestSequence.current;
    setLoadState('loading');
    setErrorMessage('');
    setRetryable(false);

    try {
      const payload = await apiRequest(buildAdminNotesRequest(requestedPage, requestedLimit, ownerId), { signal });
      const result = normalizeAdminNotesResponse(payload);
      if (sequence !== requestSequence.current) return;

      const validPage = resolveAdminNotesPage(requestedPage, result.pagination);
      if (validPage !== requestedPage) {
        setPage(validPage);
        return;
      }

      setNotes(result.notes);
      setPagination(result.pagination);
      setLoadState(result.notes.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (sequence !== requestSequence.current || signal?.aborted) return;
      setNotes([]);
      setErrorMessage(getAdminNotesErrorMessage(error));
      setRetryable(isAdminNotesRetryableError(error));
      setLoadState(error?.status === 403 ? 'forbidden' : 'error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadNotes(page, limit, appliedOwnerId, controller.signal);
    return () => {
      controller.abort();
      requestSequence.current += 1;
    };
  }, [loadNotes, page, limit, appliedOwnerId, retryCount]);

  function handleApplyFilter(event) {
    event.preventDefault();
    const ownerId = ownerInput.trim();
    const validationMessage = validateAdminOwnerFilter(ownerId);
    setOwnerError(validationMessage ?? '');
    if (validationMessage) return;

    if (ownerId === appliedOwnerId) {
      setPage(1);
      setRetryCount((current) => current + 1);
      return;
    }
    setAppliedOwnerId(ownerId);
    setPage(1);
  }

  function handleClearFilter() {
    setOwnerInput('');
    setOwnerError('');
    setPage(1);
    if (appliedOwnerId === '') setRetryCount((current) => current + 1);
    else setAppliedOwnerId('');
  }

  function handleOwnerInputChange(event) {
    setOwnerInput(event.currentTarget.value);
    setOwnerError('');
  }

  function handleLimitChange(event) {
    const nextLimit = Number(event.currentTarget.value);
    if (!PAGE_SIZES.includes(nextLimit) || nextLimit === limit) return;
    setLimit(nextLimit);
    setPage(1);
  }

  function handlePageChange(nextPage) {
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === page) return;
    setPage(nextPage);
  }

  const retry = retryable ? () => setRetryCount((current) => current + 1) : undefined;

  return (
    <main className="container admin-notes-page">
      <h1>All Notes</h1>
      <p className="admin-notes-intro">Read-only view of notes across all accounts.</p>

      <section className="admin-notes-section" aria-labelledby="admin-notes-filter-heading">
        <h2 id="admin-notes-filter-heading">Filter by owner</h2>
        <form className="admin-notes-filter-form" onSubmit={handleApplyFilter} noValidate>
          <div className="form-field">
            <label htmlFor="admin-notes-owner-filter">Owner user ID (optional)</label>
            <input
              id="admin-notes-owner-filter"
              name="ownerId"
              type="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="24-character MongoDB user ID"
              value={ownerInput}
              onChange={handleOwnerInputChange}
              aria-invalid={Boolean(ownerError)}
              aria-describedby={ownerError ? 'admin-notes-owner-error' : 'admin-notes-owner-hint'}
            />
            {ownerError
              ? <p className="field-error" id="admin-notes-owner-error">{ownerError}</p>
              : <p className="form-field__hint" id="admin-notes-owner-hint">Leave blank to show notes from every owner.</p>}
          </div>
          <div className="admin-notes-filter-actions">
            <button className="button--primary" type="submit">Apply filter</button>
            <button className="button--secondary" type="button" onClick={handleClearFilter}>Clear filter</button>
          </div>
        </form>
      </section>

      <section className="admin-notes-section" aria-labelledby="admin-notes-list-heading">
        <div className="admin-notes-section__heading">
          <h2 id="admin-notes-list-heading">Notes</h2>
          <label className="admin-notes-page-size">
            <span>Notes per page</span>
            <select value={limit} onChange={handleLimitChange} disabled={loadState === 'loading'}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>

        {loadState === 'loading' && <Message kind="loading" message="Loading notes…" />}
        {loadState === 'empty' && <Message kind="empty" message="No notes found." />}
        {loadState === 'error' && <Message kind="error" message={errorMessage} onRetry={retry} />}
        {loadState === 'forbidden' && (
          <section className="admin-notes-forbidden" role="alert" aria-labelledby="admin-notes-forbidden-heading">
            <h3 id="admin-notes-forbidden-heading">Forbidden</h3>
            <p>{errorMessage || "You don't have access to this page."}</p>
          </section>
        )}

        <div className="table-wrapper admin-notes-table-wrap">
          <table className="admin-notes-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Owner ID</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loadState === 'success' && notes.map((note) => (
                <tr key={note._id}>
                  <td>{note.title}</td>
                  <td><code>{note.owner}</code></td>
                  <td>{formatUpdatedAt(note.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-notes-total">Showing {notes.length} of {pagination.total} notes</p>
        <Pagination page={page} totalPages={pagination.totalPages} loading={loadState === 'loading'} onPageChange={handlePageChange} />
      </section>
    </main>
  );
}
