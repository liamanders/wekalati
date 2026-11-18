# Wekalati

Wekalati is an agency and diamond-delivery management app built with React/TypeScript, Express, and PostgreSQL.

## Before publishing

**Rotate the credentials that were previously present in `backend/.env.example` before pushing or deploying.** Change the Neon database password, generate a new `JWT_SECRET`, and reset the bootstrap supervisor password. If those values were ever pushed to a remote, treat them as compromised and remove them from Git history as well.

Never commit `backend/.env` or put database credentials, JWT secrets, or passwords in frontend variables. Only `VITE_*` values are included in browser code.

## Push to GitHub

After rotating the exposed credentials and confirming that no real values are in local `.env` files, create an empty GitHub repository and run these commands from the project folder:

```sh
git init
git add .
git status --short
git commit -m "Prepare Wekalati for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Check `git status` before committing: `.env` files, `node_modules`, build output, and local uploads should not be staged.

## Run locally

Requirements: Node.js 20+ and a PostgreSQL database.

1. Install the root and app dependencies:

   ```sh
   npm install
   npm --prefix frontend install
   npm --prefix backend install
   ```

2. Copy `backend/.env.example` to `backend/.env` and set:
   - `DATABASE_URL`: your Neon connection string, preferably the pooled connection string with `sslmode=require`.
   - `JWT_SECRET`: a newly generated random value of at least 64 characters.
   - `SUPERVISOR_NAME`, `SUPERVISOR_EMAIL`, and `SUPERVISOR_PASSWORD`: the first supervisor account. Use a unique password of at least 12 characters.
   - `FRONTEND_ORIGIN`: `http://localhost:5173` for local development.

3. Apply the checked-in migrations and create the initial supervisor:

   ```sh
   npm --prefix backend run db:migrate
   npm --prefix backend run db:seed:supervisor
   ```

4. Start the frontend and API:

   ```sh
   npm run dev
   ```

   The frontend runs at `http://localhost:5173` and the API at `http://localhost:3001`. The frontend uses Vite's `/api` proxy locally.

## Deploy to Vercel

Use the same GitHub repository for two Vercel projects. Deploy the backend first so you can set its URL on the frontend.

### 1. Neon

In the Neon dashboard, create/select the production database and copy its connection string. Add it only to the backend Vercel project's environment variables as `DATABASE_URL`; never add it to the frontend project.

### 2. Backend Vercel project

Import the repository into Vercel and set **Root Directory** to `backend`. Vercel serves the Express app exported from `src/app.js`; local `npm run dev` and `npm start` use `src/server.js`.

In **Project Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | New random secret, at least 64 characters |
| `FRONTEND_ORIGIN` | Production frontend origin, such as `https://your-frontend.vercel.app` |
| `SUPERVISOR_NAME` | Initial supervisor's name |
| `SUPERVISOR_EMAIL` | Initial supervisor's email |
| `SUPERVISOR_PASSWORD` | Strong, unique initial password |

Add these values to the Production environment. Add them to Preview only if you intend preview deployments to use the same database and credentials. `FRONTEND_ORIGIN` accepts a comma-separated list when you need to allow multiple exact frontend origins.

Before deploying, run the checked-in migrations against Neon and seed the first supervisor from a trusted local machine with `backend/.env` pointing to Neon:

```sh
npm --prefix backend run db:migrate
npm --prefix backend run db:seed:supervisor
```

Do not run `db:generate` against production; generate migrations during development, review them, and commit them.

### 3. Private screenshot storage

Vercel Functions do not provide durable local file storage. In the Vercel dashboard, Create a **private Blob** store and connect it to the backend project. Select **Add a read-write token env var to this connection** and make sure `BLOB_READ_WRITE_TOKEN` is set on the backend project's Production environment (and Preview if used). This token is a secret: keep it only in Vercel's backend environment variables and never commit it. Delivery screenshots stay private and are served through the authenticated API.

Local development continues to store screenshots in the ignored `backend/uploads/` directory. Uploads are limited to 4 MB to fit within Vercel Function request limits.

### 4. Frontend Vercel project

Create another Vercel project from the same repository and set **Root Directory** to `frontend`. Use the Vite defaults, with build command `npm run build` and output directory `dist`. `frontend/vercel.json` rewrites SPA routes to `index.html`.

Add this environment variable to the frontend project's Production environment:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Backend origin, such as `https://your-backend.vercel.app` (no trailing slash and no `/api`) |

This value is a public API URL, not a secret. After deploying the frontend, set the backend's `FRONTEND_ORIGIN` to the exact frontend origin and redeploy the backend.

## Application behavior

- The app starts at a real sign-in screen; it does not contain sample agencies, accounts, or deliveries.
- Supervisors create agencies with their initial admin, manage agency admins, and reset account passwords.
- Admins can manage only their appointed agency. Users can submit deliveries with a required screenshot.
- The frontend defaults to Arabic and right-to-left layout; users can switch to English.
- Screenshot images are private, limited to PNG/JPEG/WEBP and 4 MB, and accessible only through the authenticated delivery endpoint.
