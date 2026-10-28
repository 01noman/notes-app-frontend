import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Message from '../components/Message.jsx';
import Pagination from '../components/Pagination.jsx';
import {
  getProfileErrorMessage,
  isProfileRetryableError,
  mapProfileValidationDetails,
  normalizeMyPostsResponse,
  parseProfileInterests,
  resolveProfilePostsPage,
  validatePostForm,
  validateProfileForm,
} from '../profile/profileUtils.js';

const PAGE_SIZES = [10, 25, 50];
const EMPTY_PROFILE_FORM = Object.freeze({ name: '', interests: '' });
const EMPTY_POST_FORM = Object.freeze({ title: '', body: '' });

function interestsToInput(interests) {
  return Array.isArray(interests) ? interests.join(', ') : '';
}

function formatPostDate(value) {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isProfileResponse(user, expectedId) {
  return user && typeof user === 'object'
    && typeof user._id === 'string' && user._id === expectedId
    && typeof user.name === 'string'
    && typeof user.email === 'string'
    && typeof user.role === 'string'
    && Array.isArray(user.interests);
}

function isCreatedPost(post) {
  return post && typeof post === 'object'
    && typeof post._id === 'string' && post._id.length > 0
    && typeof post.title === 'string'
    && typeof post.body === 'string';
}

export default function Profile() {
  const { user, updateAuthenticatedUser } = useAuth();
  const userId = typeof user?._id === 'string' ? user._id : '';
  const currentName = typeof user?.name === 'string' ? user.name : '';
  const currentInterests = interestsToInput(user?.interests);

  const [profileForm, setProfileForm] = useState({ ...EMPTY_PROFILE_FORM, name: currentName, interests: currentInterests });
  const [profileFieldErrors, setProfileFieldErrors] = useState({});
  const [profileFormError, setProfileFormError] = useState('');
  const [profileRetry, setProfileRetry] = useState(null);
  const [profileMessage, setProfileMessage] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const nameInputRef = useRef(null);

  const [postForm, setPostForm] = useState({ ...EMPTY_POST_FORM });
  const [postFieldErrors, setPostFieldErrors] = useState({});
  const [postFormError, setPostFormError] = useState('');
  const [postRetry, setPostRetry] = useState(null);
  const [postMessage, setPostMessage] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const titleInputRef = useRef(null);

  const [posts, setPosts] = useState([]);
  const [postsPagination, setPostsPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [postsPage, setPostsPage] = useState(1);
  const [postsLimit, setPostsLimit] = useState(10);
  const [postsState, setPostsState] = useState('loading');
  const [postsError, setPostsError] = useState('');
  const postsRequestSequence = useRef(0);

  useEffect(() => {
    setProfileForm({ name: currentName, interests: currentInterests });
    setProfileFieldErrors({});
    setProfileFormError('');
  }, [userId, currentName, currentInterests]);

  const loadPosts = useCallback(async (requestedPage, requestedLimit) => {
    if (!userId) {
      setPosts([]);
      setPostsState('empty');
      setPostsError('');
      return;
    }

    const sequence = ++postsRequestSequence.current;
    setPostsState('loading');
    setPostsError('');

    try {
      const query = new URLSearchParams({ page: String(requestedPage), limit: String(requestedLimit) });
      const payload = await apiRequest(`users/${encodeURIComponent(userId)}/posts?${query.toString()}`);
      const result = normalizeMyPostsResponse(payload);
      if (sequence !== postsRequestSequence.current) return;

      const validPage = resolveProfilePostsPage(requestedPage, result.pagination);
      if (validPage !== requestedPage) {
        setPostsPage(validPage);
        return;
      }

      setPosts(result.posts);
      setPostsPagination(result.pagination);
      setPostsState(result.posts.length > 0 ? 'success' : 'empty');
    } catch (error) {
      if (sequence !== postsRequestSequence.current) return;
      setPostsError(getProfileErrorMessage(error, 'posts'));
      setPostsState('error');
    }
  }, [userId]);

  useEffect(() => {
    void loadPosts(postsPage, postsLimit);
    return () => {
      postsRequestSequence.current += 1;
    };
  }, [loadPosts, postsPage, postsLimit]);

  function clearProfileMessages() {
    setProfileMessage(null);
    setProfileFormError('');
    setProfileRetry(null);
  }

  function handleProfileChange(event) {
    const { name, value } = event.currentTarget;
    setProfileForm((current) => ({ ...current, [name]: value }));
    setProfileFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    clearProfileMessages();
  }

  async function handleProfileSubmit(event) {
    event?.preventDefault?.();
    clearProfileMessages();
    setProfileRetry(null);

    const errors = validateProfileForm(profileForm);
    setProfileFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      nameInputRef.current?.focus();
      return;
    }
    if (!userId) {
      setProfileFormError('Your session is not ready. Please log in again.');
      return;
    }

    setSavingProfile(true);
    try {
      const payload = await apiRequest('users/me', {
        method: 'PATCH',
        body: {
          name: profileForm.name.trim(),
          interests: parseProfileInterests(profileForm.interests),
        },
      });
      const updatedUser = payload?.data?.user;
      if (!isProfileResponse(updatedUser, userId)) {
        throw new Error('The server returned an invalid profile response.');
      }

      updateAuthenticatedUser(updatedUser);
      setProfileForm({ name: updatedUser.name, interests: interestsToInput(updatedUser.interests) });
      setProfileFieldErrors({});
      setProfileMessage({ kind: 'success', message: 'Profile saved.' });
    } catch (error) {
      const mapped = mapProfileValidationDetails(error?.details, ['name', 'interests']);
      setProfileFieldErrors(mapped.fieldErrors);
      const hasFieldErrors = Object.keys(mapped.fieldErrors).length > 0;
      setProfileFormError(mapped.formError ?? (hasFieldErrors ? '' : getProfileErrorMessage(error, 'save')));
      if (isProfileRetryableError(error)) {
        setProfileRetry(() => () => { void handleProfileSubmit(); });
      } else {
        setProfileRetry(null);
      }
    } finally {
      setSavingProfile(false);
    }
  }

  function clearPostMessages() {
    setPostMessage(null);
    setPostFormError('');
    setPostRetry(null);
  }

  function handlePostChange(event) {
    const { name, value } = event.currentTarget;
    setPostForm((current) => ({ ...current, [name]: value }));
    setPostFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    clearPostMessages();
  }

  async function handlePostSubmit(event) {
    event?.preventDefault?.();
    clearPostMessages();
    setPostRetry(null);

    const errors = validatePostForm(postForm);
    setPostFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      titleInputRef.current?.focus();
      return;
    }
    if (!userId) {
      setPostFormError('Your session is not ready. Please log in again.');
      return;
    }

    setPublishing(true);
    try {
      const payload = await apiRequest('posts', {
        method: 'POST',
        body: { title: postForm.title.trim(), body: postForm.body },
      });
      if (!isCreatedPost(payload?.data?.post)) {
        throw new Error('The server returned an invalid post response.');
      }

      setPostForm({ ...EMPTY_POST_FORM });
      setPostFieldErrors({});
      setPostMessage({ kind: 'success', message: 'Post published.' });
      if (postsPage !== 1) setPostsPage(1);
      else void loadPosts(1, postsLimit);
    } catch (error) {
      const mapped = mapProfileValidationDetails(error?.details, ['title', 'body']);
      setPostFieldErrors(mapped.fieldErrors);
      const hasFieldErrors = Object.keys(mapped.fieldErrors).length > 0;
      setPostFormError(mapped.formError ?? (hasFieldErrors ? '' : getProfileErrorMessage(error, 'publish')));
      if (isProfileRetryableError(error)) {
        setPostRetry(() => () => { void handlePostSubmit(); });
      } else {
        setPostRetry(null);
      }
    } finally {
      setPublishing(false);
    }
  }

  function handlePostsPageChange(nextPage) {
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === postsPage) return;
    setPostsPage(nextPage);
  }

  function handlePostsLimitChange(event) {
    const nextLimit = Number(event.currentTarget.value);
    if (!PAGE_SIZES.includes(nextLimit) || nextLimit === postsLimit) return;
    setPostsLimit(nextLimit);
    setPostsPage(1);
  }

  return (
    <main className="container profile-page">
      <h1>My Profile</h1>
      {profileMessage && (
        <Message kind={profileMessage.kind} message={profileMessage.message} compact />
      )}

      <section className="profile-section" aria-labelledby="profile-details-heading">
        <h2 id="profile-details-heading">Profile details</h2>
        {profileFormError && (
          <Message
            kind="error"
            message={profileFormError}
            onRetry={profileRetry ?? undefined}
            compact
          />
        )}

        <form className="profile-form" onSubmit={handleProfileSubmit} noValidate aria-busy={savingProfile}>
          <div className="form-field">
            <label htmlFor="profile-name">Name</label>
            <input
              ref={nameInputRef}
              id="profile-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={80}
              required
              value={profileForm.name}
              onChange={handleProfileChange}
              aria-invalid={Boolean(profileFieldErrors.name)}
              aria-describedby={profileFieldErrors.name ? 'profile-name-error' : undefined}
            />
            {profileFieldErrors.name && <p className="field-error" id="profile-name-error">{profileFieldErrors.name}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="profile-email">Email (read-only)</label>
            <input
              id="profile-email"
              name="email"
              type="email"
              autoComplete="email"
              value={typeof user?.email === 'string' ? user.email : ''}
              readOnly
              aria-readonly="true"
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-role">Role (read-only)</label>
            <input
              id="profile-role"
              name="role"
              type="text"
              value={typeof user?.role === 'string' ? user.role : ''}
              readOnly
              aria-readonly="true"
            />
          </div>

          <div className="form-field">
            <label htmlFor="profile-interests">Interests (optional)</label>
            <input
              id="profile-interests"
              name="interests"
              type="text"
              autoComplete="off"
              placeholder="reading, chess, music"
              value={profileForm.interests}
              onChange={handleProfileChange}
              aria-invalid={Boolean(profileFieldErrors.interests)}
              aria-describedby={profileFieldErrors.interests ? 'profile-interests-error' : 'profile-interests-hint'}
            />
            {profileFieldErrors.interests
              ? <p className="field-error" id="profile-interests-error">{profileFieldErrors.interests}</p>
              : <p className="form-field__hint" id="profile-interests-hint">Separate interests with commas; enter up to 10, each at most 30 characters.</p>}
          </div>

          <div className="profile-form__actions">
            <button className="button--primary" type="submit" disabled={savingProfile}>
              {savingProfile ? 'Saving profile…' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section" aria-labelledby="profile-post-composer-heading">
        <h2 id="profile-post-composer-heading">Publish a post</h2>
        {postFormError && (
          <Message kind="error" message={postFormError} onRetry={postRetry ?? undefined} compact />
        )}
        {postMessage && <Message kind={postMessage.kind} message={postMessage.message} compact />}

        <form className="profile-post-form" onSubmit={handlePostSubmit} noValidate aria-busy={publishing}>
          <div className="form-field">
            <label htmlFor="profile-post-title">Title</label>
            <input
              ref={titleInputRef}
              id="profile-post-title"
              name="title"
              type="text"
              autoComplete="off"
              maxLength={120}
              required
              value={postForm.title}
              onChange={handlePostChange}
              aria-invalid={Boolean(postFieldErrors.title)}
              aria-describedby={postFieldErrors.title ? 'profile-post-title-error' : undefined}
            />
            {postFieldErrors.title && <p className="field-error" id="profile-post-title-error">{postFieldErrors.title}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="profile-post-body">Body</label>
            <textarea
              id="profile-post-body"
              name="body"
              maxLength={5000}
              required
              value={postForm.body}
              onChange={handlePostChange}
              aria-invalid={Boolean(postFieldErrors.body)}
              aria-describedby={postFieldErrors.body ? 'profile-post-body-error' : undefined}
            />
            {postFieldErrors.body && <p className="field-error" id="profile-post-body-error">{postFieldErrors.body}</p>}
          </div>

          <div className="profile-form__actions">
            <button className="button--primary" type="submit" disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      </section>

      <section className="profile-section profile-posts-section" aria-labelledby="my-posts-heading">
        <div className="profile-posts-section__heading">
          <h2 id="my-posts-heading">My Posts</h2>
          {userId && <Link to={`/users/${encodeURIComponent(userId)}/posts`}>View my public page</Link>}
        </div>

        <div className="profile-page-size">
          <label htmlFor="profile-posts-limit">Posts per page</label>
          <select id="profile-posts-limit" value={postsLimit} onChange={handlePostsLimitChange} disabled={postsState === 'loading'}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>

        {postsState === 'loading' && <Message kind="loading" message="Loading posts…" />}
        {postsState === 'error' && (
          <Message kind="error" message={postsError} onRetry={() => { void loadPosts(postsPage, postsLimit); }} />
        )}
        {postsState === 'empty' && <Message kind="empty" message="You haven't published any posts." />}

        {postsState === 'success' && (
          <div className="profile-post-list">
            {posts.map((post) => (
              <article className="profile-post" key={post._id}>
                <div className="profile-post__heading">
                  <h3>{post.title}</h3>
                  <time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time>
                </div>
                <p className="profile-post__body">{post.body}</p>
              </article>
            ))}
          </div>
        )}

        <Pagination
          page={postsPage}
          totalPages={postsPagination.totalPages}
          loading={postsState === 'loading'}
          onPageChange={handlePostsPageChange}
        />
      </section>
    </main>
  );
}
