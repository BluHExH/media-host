# Media Host

**Private CDN media hosting** for images, video, audio, and HTML — with accounts, folders, expiry links, and a public gallery.

<p align="center">
  <img src="public/branding.svg" alt="Media Host" width="720" />
</p>

**Live:** [media-host-psi.vercel.app](https://media-host-psi.vercel.app)

---

## Overview

Media Host is a full-stack Next.js app that stores files on **Vercel Blob** and keeps user data in **Neon Postgres**. Every upload is tied to a signed-in account. Guests cannot upload.

| Layer | Technology |
|--------|------------|
| Framework | Next.js 15 (App Router) |
| Storage | Vercel Blob (public CDN URLs) |
| Database | Neon Postgres (serverless) |
| Auth | Username / password + access & refresh tokens |
| Deploy | Vercel |

---

## Features

### Media
- **Upload** images, video, audio, and HTML (multi-file)
- **Instant public CDN URL** with one-click copy
- **Folders** — organize files; create folders on upload
- **Expiry** — never, 1 / 7 / 30 / 90 days, or 1 year (chosen at upload)
- **HTML hosting** — live iframe preview of uploaded HTML pages
- **Public gallery** — optional share to the public gallery feed
- **Delete** — remove files from Blob and database

### Accounts & security
- **Register / Sign in** required before any upload
- **User isolation** — one user cannot see another user’s library
- **Hashed passwords** (PBKDF2)
- **Access token** (~30 days) + **refresh token** rotation
- **Rate limiting** on auth and upload routes
- **Login logs** and basic IP tracking
- **Profile** — display name, username, avatar, activity graph, account delete

### Product pages
| Path | Purpose |
|------|---------|
| `/` | Landing + upload entry (login required) |
| `/login` | Sign in / register |
| `/library` | Private library, folders, upload modal |
| `/gallery` | Public read-only gallery |
| `/profile` | Account settings, stats, activity |

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/BluHExH/media-host.git
cd media-host
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
# Required — Vercel Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Required — Neon Postgres connection string
DATABASE_URL=postgresql://...

# Optional — stronger token signing
AUTH_SECRET=long-random-string
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first use, open `/api/setup` once (or register via the UI) so database tables are created.

---

## Deploy on Vercel

1. Import the GitHub repo into [Vercel](https://vercel.com).
2. **Storage → Blob** — create/connect a Blob store (`BLOB_READ_WRITE_TOKEN` is injected).
3. **Storage → Neon** (or paste `DATABASE_URL` under Environment Variables).
4. Set env for **Production**, **Preview**, and **Development** as needed.
5. Deploy.

After deploy, visit:

```text
https://YOUR-APP.vercel.app/api/setup
```

You should see: `{"ok":true,"message":"Database tables ready"}`.

---

## How to use

### Create an account
1. Open **Get started** or `/login?tab=register`.
2. Choose a username and password (min 6 characters).
3. You are redirected to **Library**.

### Upload files
1. Go to **Library**.
2. Drop files or click the drop zone.
3. In the modal, set:
   - **How long to keep** (expiry)
   - **Folder** (or create a new folder)
   - Optional **public gallery**
4. Click **Upload**.
5. Use **Copy URL** for the CDN link.

### Organize
- Use folder tabs at the top of Library.
- Filter by type: all / image / video / audio / html.

### Profile
- Edit display name and username.
- Change profile photo (image, max 5 MB).
- View activity (uploads & logins, last 14 days).
- Delete account (removes user data and files).

### Public gallery
- Files marked public appear on `/gallery` for everyone.
- Private files never appear there.

---

## API (summary)

All write routes require the `x-auth-token` header (access token from login/register).

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Sign in → `token` + `refreshToken` |
| `POST` | `/api/auth/refresh` | Rotate tokens |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/upload` | Multipart upload (`file`, `album`, `expiry`, `public`) |
| `GET` | `/api/list` | Current user’s files |
| `DELETE` | `/api/delete` | Body: `{ "urls": ["..."] }` |
| `GET` | `/api/profile` | Profile + stats + activity |
| `PATCH` | `/api/profile` | Update name / username |
| `DELETE` | `/api/profile` | Delete account (`confirm: "DELETE"`) |
| `POST` | `/api/profile/avatar` | Avatar image upload |
| `GET` | `/api/setup` | Ensure DB schema |

Unauthenticated upload/list return **401**.

---

## Project structure

```text
src/
  app/
    page.tsx              # Landing
    login/page.tsx
    library/page.tsx
    gallery/page.tsx
    profile/page.tsx
    api/                  # Route handlers
  components/
    Hero3D.tsx            # CSS 3D hero (responsive)
  lib/
    db.ts                 # Neon, auth tokens, schema
    client-auth.ts        # Browser session + refresh
public/
  branding.svg            # Brand banner
  icon.svg / logo.svg     # App icon
```

---

## Branding assets

| Asset | URL path |
|--------|----------|
| Banner (1200×630) | `/branding.svg` |
| Icon | `/icon.svg` |
| Logo | `/logo.svg` |

Use the banner for GitHub social preview (export to PNG if required) and Open Graph.

---

## Security notes

- Passwords are never stored in plain text.
- Access tokens are HMAC-signed; refresh tokens are hashed in the database.
- Each media row is scoped by `user_id`.
- Rate limits reduce brute-force and abuse.
- Prefer a strong unique `AUTH_SECRET` in production.

---

## Scripts

```bash
npm run dev      # development
npm run build    # production build
npm run start    # run production server
```

---

## License

Private project. All rights reserved unless otherwise stated.

---

**Media Host** — sign in, upload, share a link.
