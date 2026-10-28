import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client.js';
import Message from '../components/Message.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  buildAdminInterestsRequest,
  getAdminInterestsErrorMessage,
  isAdminInterestsRetryableError,
  normalizeAdminInterestsResponse,
  resolveAdminInterestsPage,
} from '../admin-interests/adminInterestsUtils.js';

const PAGE_SIZES = [10, 25, 50];
const EMPTY_PAGINATION = Object.freeze({ page: 1, limit: 10, total: 0, totalPages: 0 });

export default function AdminInterests() {
  const [interests, setInterests] = useState([]);
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loadState, setLoadState] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestSequence = useRef(0);

  const loadInterests = useCallback(async (requestedPage, requestedLimit, signal) => {
    const sequence = ++requestSequence.current;
    setLoadState('loading');
    setErrorMessage('');
    setRetryable(false);

    try {
      const payload = await apiRequest(buildAdminInterestsRequest(requestedPage, requestedLimit), { signal });
      const result = normalizeAdminInterestsResponse(payload);
      if (sequence !== requestSequence.current) return;

      const validPage = resolveAdminInterestsPage(requestedPage, result.pagination);
      if (validPage !== requestedPage) {
        setPage(validPage);
        return;
      }

      setInterests(result.interests);
      setPagination(result.pagination);
      setLoadState(result.interests.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (sequence !== requestSequence.current || signal?.aborted) return;
      setInterests([]);
      setErrorMessage(getAdminInterestsErrorMessage(error));
      setRetryable(isAdminInterestsRetryableError(error));
      setLoadState(error?.status === 403 ? 'forbidden' : 'error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadInterests(page, limit, controller.signal);
    return () => {
      controller.abort();
      requestSequence.current += 1;
    };
  }, [loadInterests, page, limit, retryCount]);

  function handlePageChange(nextPage) {
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === page) return;
    setPage(nextPage);
  }

  function handleLimitChange(event) {
    const nextLimit = Number(event.currentTarget.value);
    if (!PAGE_SIZES.includes(nextLimit) || nextLimit === limit) return;
    setLimit(nextLimit);
    setPage(1);
  }

  const retry = retryable ? () => setRetryCount((current) => current + 1) : undefined;

  return (
    <main className="container admin-interests-page">
      <h1>Users by Interest</h1>
      <p className="admin-interests-intro">Groups of users sharing each interest. Counts and members come from the grouped-interest API.</p>

      <section className="admin-interests-section" aria-labelledby="admin-interests-list-heading">
        <div className="admin-interests-section__heading">
          <h2 id="admin-interests-list-heading">Interest groups</h2>
          <label className="admin-interests-page-size">
            <span>Interests per page</span>
            <select value={limit} onChange={handleLimitChange} disabled={loadState === 'loading'}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>

        {loadState === 'loading' && <Message kind="loading" message="Loading interests…" />}
        {loadState === 'empty' && <Message kind="empty" message="No users have interests yet." />}
        {loadState === 'error' && <Message kind="error" message={errorMessage} onRetry={retry} />}
        {loadState === 'forbidden' && (
          <section className="admin-interests-forbidden" role="alert" aria-labelledby="admin-interests-forbidden-heading">
            <h3 id="admin-interests-forbidden-heading">Forbidden</h3>
            <p>{errorMessage || "You don't have access to this page."}</p>
          </section>
        )}

        {loadState === 'success' && (
          <div className="admin-interests-groups">
            {interests.map((group) => (
              <article className="admin-interest-group" key={group.interest}>
                <h3>{group.interest} <span aria-label={`${group.count} users`}>· {group.count}</span></h3>
                <ul className="admin-interest-group__users">
                  {group.users.map((user) => (
                    <li key={user._id}>
                      <span className="admin-interest-group__user-name">{user.name}</span>
                      <span className="admin-interest-group__user-email">{user.email}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}

        <p className="admin-interests-total">Showing {interests.length} of {pagination.total} interest groups</p>
        <Pagination page={page} totalPages={pagination.totalPages} loading={loadState === 'loading'} onPageChange={handlePageChange} />
      </section>
    </main>
  );
}
