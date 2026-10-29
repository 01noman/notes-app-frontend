# Secure Notes — Frontend

A small React + Vite client for the Secure Note-Taking Application. This repository is intentionally hand-written and uses plain CSS; it does not use a UI framework or generated starter template.

## Live deployment

- **Backend API (Render):** `https://notes-app-backend-aqh8.onrender.com/api/v1`
- **Frontend (Vercel):** ADD the stable production URL here, and put the same exact value in `CORS_ORIGINS` on Render.
- Free Render services sleep after about 15 minutes idle, so the first request can take up to a minute; the app shows a Retry message and keeps your session.

## Requirements

- Node.js `>=24 <25` (the project was verified with Node `v24.22.1`)
- The backend API running locally, or a deployed API URL

## Configure the API

Copy `.env.example` to `.env` and set `VITE_API_URL` to the backend API base URL. The local default is:

```dotenv
VITE_API_URL=http://localhost:4000/api/v1
```

For deployment, set `VITE_API_URL` in the hosting provider to the deployed backend URL ending in `/api/v1`. Do not put secrets in this variable; Vite exposes `VITE_*` values to the browser.

## Install and run

```sh
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173`.

## Tests and production preview

```sh
npm test
npm run build
npm run preview
```

The preview server uses port `4173`. The production output is written to `dist/`.

## Routes and access

| Route | Access | Purpose |
|---|---|---|
| `/` | Redirect | Redirects to `/notes` (the auth guard sends anonymous visitors to login) |
| `/login` | Anonymous only | Sign in |
| `/register` | Anonymous only | Create an account |
| `/notes` | Signed-in user or admin | Create, edit, delete, and paginate your own notes |
| `/profile` | Signed-in user or admin | Update profile, publish posts, and view your posts |
| `/users/:id/posts` | Public | View a user's public posts without logging in |
| `/admin/users` | Admin only | Add, list, edit, and delete users; self-protection applies |
| `/admin/notes` | Admin only | Read-only notes list with an optional owner ID filter |
| `/admin/interests` | Admin only | Paginated groups of users by interest |
| `*` | Public | Not Found screen |

Frontend guards improve navigation, but backend authorization remains authoritative. A non-admin who opens an admin route sees Forbidden; they are not silently redirected in a loop.

## Vercel deployment

Deploy this frontend repository with Vercel's Vite preset. Set `VITE_API_URL` in the Vercel project environment variables, then redeploy after changing it.

`vercel.json` rewrites deep links to `/index.html` so routes such as `/admin/users` and `/users/<id>/posts` still load after a browser refresh. It also sets a Content Security Policy and `X-Content-Type-Options`.

`connect-src` in `vercel.json` allows only the deployed backend origin `https://notes-app-backend-aqh8.onrender.com` (origin only, no `/api/v1`). If the backend moves to another URL, update `connect-src` and redeploy. `vercel.json` contains no localhost allowance: its headers apply only on Vercel, so local `npm run dev` and `npm run preview` are unaffected.

## Route and refresh smoke checks

After `npm run build`, run `npm run preview` and verify:

- `/login` and `/register` display their forms.
- An anonymous visitor opening `/notes` is sent to `/login`; after sign-in, the original destination is restored.
- A signed-in regular user can open `/notes` and `/profile`.
- An admin can open all `/admin/*` pages; a regular user sees Forbidden for those routes.
- `/users/<known-user-id>/posts` works in a private window with no session.
- An unknown path shows Page not found.
- Refreshing `/admin/users` and `/users/<known-user-id>/posts` does not return the hosting provider's 404 page.


## Phase 4.10 — Frontend manual QA checklist

Run the frontend and backend locally with the demo data loaded. Tick each item only after verifying it in the browser against the running API. Use demo credentials, not real passwords. Record any failure next to the relevant item before fixing it.

### User stories US-01 through US-08 — account and notes

- [ ] **US-01 — Register:** register a new account with name, email, password, and optional interests; confirm the UI signs in and navigates to Notes. Try a duplicate email and confirm a safe field/form error appears. Confirm the client cannot choose the registration role.
- [ ] **US-02 — Login:** log in with valid credentials; invalid email and invalid password display the same generic authentication message. Confirm a page refresh keeps a valid session.
- [ ] **US-03 — Profile:** open Profile, update name and interests, save, reload, and confirm the saved normalized interests are shown. Email and role are read-only.
- [ ] **US-04 — Create note:** create a note with a valid title and content; confirm it appears in My Notes. Try empty and overlong values and confirm inline validation.
- [ ] **US-05 — List own notes:** create enough notes to paginate, switch page sizes (10/25/50), and confirm newest-first ordering and correct paging. Sign in as a second user and confirm the first user's notes aren't listed.
- [ ] **US-06 — View note:** open/load one of your notes through the UI (for example, using its edit action) and confirm its contents populate correctly. Confirm another user's note is not exposed if you exercise the endpoint directly.
- [ ] **US-07 — Update note:** edit your note and save; confirm the changed values persist after reload. Confirm attempts to update another user's note are rejected.
- [ ] **US-08 — Delete note:** delete your note and accept the confirmation; confirm it disappears. Delete the last note on the last page and confirm pagination returns to a valid page.

### Admin stories US-09 through US-13

- [ ] **US-09 — List users:** as an admin, open Admin Users and verify pagination and page-size changes. As a regular user, open `/admin/users` directly and confirm Forbidden; an anonymous visitor should be sent to Login.
- [ ] **US-10 — Add user:** as an admin, create both a regular user and an admin using the form. Confirm duplicate-email and invalid-field errors display safely.
- [ ] **US-11 — Manage user:** view and edit another user's profile, including role and interests; test password reset only with a disposable test account. Delete a disposable account and verify its notes/posts are removed. Confirm the current admin's own row cannot be deleted or have its role changed.
- [ ] **US-12 — List all notes:** open Admin Notes; confirm the table is read-only, pagination works, and a valid owner ID filter returns the expected notes. An invalid owner ID should show a safe validation message.
- [ ] **US-13 — Group by interests:** open Admin Interests and confirm group names/counts, pagination, and displayed member details match the API. Verify a regular user cannot access the page.

### Post stories US-14 through US-15

- [ ] **US-14 — Publish post:** as a signed-in user, publish a post from Profile; confirm it appears under My Posts and on that user's public posts page. Test required title/body validation.
- [ ] **US-15 — Public posts:** open `/users/<known-user-id>/posts` in a private/incognito window while logged out. Confirm posts are newest first, pagination works, an account without posts shows an empty state, and a nonexistent user shows User not found.

### Session, failure, and routing checks

- [ ] **Expired/invalid token:** in browser DevTools, set `localStorage` key `notes.token` to an invalid value, reload a protected page, and confirm the session is cleared and Login is shown with a useful notice. Then log in normally.
- [ ] **Cold-start/API unavailable message:** stop the backend and reload a page requiring API data; confirm the app shows a safe, helpful error and Retry (where available), not a blank screen or raw stack trace. Restart the backend and confirm Retry recovers.
- [ ] **Deep-link refresh:** run `npm run build` and `npm run preview`; directly open and refresh `/admin/users`, `/admin/notes`, `/admin/interests`, and `/users/<known-user-id>/posts`. Confirm the app route loads instead of a host-level 404.
- [ ] **Not Found:** open an unknown path; confirm the accessible Not Found screen and recovery links work.
- [ ] **Role-based header/navigation:** verify anonymous, regular-user, and admin header links differ correctly; a regular user accessing admin routes sees Forbidden without a redirect loop.
    