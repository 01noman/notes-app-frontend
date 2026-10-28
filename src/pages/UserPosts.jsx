import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import Message from '../components/Message.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  buildPublicPostsRequest,
  getPublicPostsErrorMessage,
  isRetryablePublicPostsError,
  normalizePublicPostsResponse,
  resolvePublicPostsPage,
} from '../public-posts/publicPostsUtils.js';

const PAGE_SIZES = [10, 25, 50];
const EMPTY_PAGINATION = Object.freeze({ page: 1, limit: 10, total: 0, totalPages: 0 });

function formatPublicPostDate(value) {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function UserPosts() {
  const { id = '' } = useParams();
  const [publicUser, setPublicUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loadState, setLoadState] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [retryable, setRetryable] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const controller = new AbortController();

    setLoadState('loading');
    setErrorMessage('');
    setRetryable(false);
    setPublicUser(null);
    setPosts([]);
    setPagination({ ...EMPTY_PAGINATION, page, limit });

    async function loadPublicPosts() {
      if (typeof id !== 'string' || id.trim().length === 0) {
        setErrorMessage('User not found.');
        setLoadState('error');
        return;
      }

      const request = buildPublicPostsRequest(id, page, limit);
      try {
        const payload = await apiRequest(request.path, {
          ...request.options,
          signal: controller.signal,
        });
        const result = normalizePublicPostsResponse(payload, id);
        if (sequence !== requestSequence.current) return;

        const validPage = resolvePublicPostsPage(page, result.pagination);
        if (validPage !== page) {
          setPage(validPage);
          return;
        }

        setPublicUser(result.user);
        setPosts(result.posts);
        setPagination(result.pagination);
        setLoadState(result.posts.length > 0 ? 'success' : 'empty');
      } catch (error) {
        if (sequence !== requestSequence.current || controller.signal.aborted) return;
        setErrorMessage(getPublicPostsErrorMessage(error));
        setRetryable(isRetryablePublicPostsError(error));
        setLoadState('error');
      }
    }

    void loadPublicPosts();
    return () => {
      controller.abort();
      requestSequence.current += 1;
    };
  }, [id, page, limit, retryCount]);

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

  function retryLoad() {
    setRetryCount((current) => current + 1);
  }

  const heading = publicUser ? `Public posts by ${publicUser.name}` : 'Public user posts';

  return (
    <main className="container public-posts-page">
      <h1>{heading}</h1>
      {loadState === 'loading' && (
        <Message kind="loading" message="Loading public posts…" />
      )}
      {loadState === 'error' && (
        <Message
          kind="error"
          message={errorMessage}
          onRetry={retryable ? retryLoad : undefined}
        />
      )}
      {loadState === 'empty' && (
        <Message kind="empty" message="This user has no posts yet." />
      )}
      {loadState === 'success' && (
        <section className="public-posts-section" aria-label="Public posts">
          <p className="public-posts-page__count">
            {pagination.total} {pagination.total === 1 ? 'post' : 'posts'}
          </p>
          <div className="profile-post-list">
            {posts.map((post) => (
              <article className="profile-post" key={post._id}>
                <div className="profile-post__heading">
                  <h2>{post.title}</h2>
                  <time dateTime={post.createdAt}>{formatPublicPostDate(post.createdAt)}</time>
                </div>
                <p className="profile-post__body">{post.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="public-posts-page__controls">
        <div className="profile-page-size">
          <label htmlFor="public-posts-limit">Posts per page</label>
          <select
            id="public-posts-limit"
            value={limit}
            onChange={handleLimitChange}
            disabled={loadState === 'loading'}
          >
            {PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
          </select>
        </div>
        <Pagination
          page={page}
          totalPages={pagination.totalPages}
          loading={loadState === 'loading'}
          onPageChange={handlePageChange}
        />
      </div>
    </main>
  );
}
