# Secure Notes — Frontend

A small React + Vite client for the Secure Note-Taking Application. This repository is intentionally hand-written and uses plain CSS; it does not use a UI framework or generated starter template.

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

**Before production deployment:** edit `connect-src` in `vercel.json` to replace the temporary `https://*.onrender.com` allowance with the exact HTTPS origin of your backend (for example, `https://your-service.onrender.com`). Keep the origin only—do not add `/api/v1` to the CSP host. The localhost allowance is for local API development and can be removed for production. Make sure the backend's `CORS_ORIGINS` includes the exact Vercel site origin. Do not add inline scripts or inline style attributes; the CSP intentionally blocks them.

## Route and refresh smoke checks

After `npm run build`, run `npm run preview` and verify:

- `/login` and `/register` display their forms.
- An anonymous visitor opening `/notes` is sent to `/login`; after sign-in, the original destination is restored.
- A signed-in regular user can open `/notes` and `/profile`.
- An admin can open all `/admin/*` pages; a regular user sees Forbidden for those routes.
- `/users/<known-user-id>/posts` works in a private window with no session.
- An unknown path shows Page not found.
- Refreshing `/admin/users` and `/users/<known-user-id>/posts` does not return the hosting provider's 404 page.
