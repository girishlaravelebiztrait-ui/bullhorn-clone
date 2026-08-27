# ATS — Candidate Storage (Phase 1)

Phase 1 of a Bullhorn-style applicant tracking system: **candidate data management done properly** — import, manual entry, admin CRUD, local resume parsing, and Elasticsearch-backed search/filtering.

Everything runs **100% on your own computer**. There is no cloud, no hosting, and no remote server involved. The only time you need the internet is the first run, to download the tools and container images.

> **Out of scope for this phase:** job orders, pipelines, email/calendar sync, multi-role permissions, reporting, public portal, paid parsing APIs, S3 storage.

---

## Table of contents

1. [What this needs to run](#1-what-this-needs-to-run)
2. [What to download (one time)](#2-what-to-download-one-time)
3. [First-time setup (step by step)](#3-first-time-setup-step-by-step)
4. [Logging in](#4-logging-in)
5. [Everyday use (start / stop)](#5-everyday-use-start--stop)
6. [Command reference](#6-command-reference)
7. [Troubleshooting](#7-troubleshooting)
8. [How it works](#8-how-it-works)
9. [Feature guide](#9-feature-guide)
10. [Project structure](#10-project-structure)
11. [Notes & decisions](#11-notes--decisions)

---

## 1. What this needs to run

The app is a **Next.js** website. To do its job it also needs two supporting services, which run **locally on your PC as Docker containers** (you do not install them by hand):

- **MySQL** — the database where candidate records are stored (the source of truth).
- **Elasticsearch** — the search engine that powers the search box, filters, and facets.

You do **not** need to buy or set up any server. "Docker" is simply a tool that runs MySQL and Elasticsearch for you, locally. Once the images are downloaded the first time, it all works offline.

**Rough system requirements:** ~2 GB of free RAM while running, ~3 GB of free disk for the Docker images, and virtualization enabled (standard on any modern PC).

---

## 2. What to download (one time)

Install these three tools. If you already have them, skip.

| Tool | Why | Where to get it |
|---|---|---|
| **Node.js 20.6+** (LTS 20 or 22 recommended) | Runs the app | https://nodejs.org — download the LTS installer, click through, accept defaults |
| **Docker Desktop** | Runs MySQL + Elasticsearch locally | https://www.docker.com/products/docker-desktop — download, install, restart if asked |
| **Git** (optional) | To clone the project | https://git-scm.com/downloads |

### Verify the installs

Open a terminal (**PowerShell** on Windows) and run:

```bash
node --version
```
```bash
docker --version
```

You should see version numbers for both. If a command is "not recognized," close and reopen the terminal (the installer updates your PATH), or reboot.

### Windows only: enable WSL2 (Docker's engine)

Docker Desktop on Windows runs on **WSL2**. If Docker Desktop shows a WSL error on first launch, open **PowerShell as Administrator** and run this once, then reboot:

```bash
wsl --install
```

Then open Docker Desktop from the Start menu and wait until the whale icon in the system tray says **"Docker Desktop is running."** Docker must be running for the steps below to work.

---

## 3. First-time setup (step by step)

Open a terminal in the project folder. Run these **in order**. Each is explained below.

### Step 1 — Install the project's dependencies

```bash
npm install
```
Downloads the app's libraries into `node_modules/`. Takes a few minutes the first time.

### Step 2 — Create your environment file

```bash
cp .env.example .env
```
On Windows PowerShell, if `cp` doesn't work, use:
```bash
Copy-Item .env.example .env
```
Then open `.env` in any editor and set at least:
- `NEXTAUTH_SECRET` — any long random string (or generate one with `openssl rand -base64 32`).
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` — your login for the app.

The `DATABASE_URL` and `ELASTICSEARCH_URL` defaults already match the Docker services, so leave them as-is.

### Step 3 — Start Docker Desktop

Make sure Docker Desktop is open and the tray icon says it's running (see the Windows note above).

### Step 4 — Start MySQL + Elasticsearch

```bash
docker compose up -d
```
The **first** run downloads the MySQL and Elasticsearch images (~1.5 GB) — this can take several minutes depending on your connection. Later runs start in seconds. When it finishes, check both are healthy:

```bash
docker compose ps
```
Wait until both services show **`healthy`** (about 30–40 seconds after they start). If they say `starting`, give it a moment and run it again.

### Step 5 — Create the database tables

```bash
npx prisma migrate deploy
```
```bash
npx prisma generate
```
`migrate deploy` applies the committed migration to your database; `generate` builds the database client. We use `deploy` (not `migrate dev`) because the app's MySQL user is intentionally limited and can't create the "shadow database" that `migrate dev` requires — `deploy` doesn't need it. Use `migrate dev` only when you're changing the schema and creating *new* migrations (that needs a broader-privilege DB user).

### Step 6 — Create the search index

```bash
npm run es:init
```
Creates the `candidates` index in Elasticsearch. Safe to run again anytime.

### Step 7 — Create your admin login

```bash
npm run seed
```
Creates the admin account from the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in your `.env`.

### Step 8 — Start the app

```bash
npm run dev
```
Leave this running. Open **http://localhost:3000** in your browser.

---

## 4. Logging in

Go to **http://localhost:3000**, which sends you to the login page. Sign in with the email and password you set in `.env` (defaults in `.env.example` are `admin@example.com` / `ChangeMe123!` — change these).

---

## 5. Everyday use (start / stop)

After the one-time setup, your daily flow is short.

**To start working:**
1. Open Docker Desktop (or run `docker compose start`).
2. In the project folder: `npm run dev`.
3. Open http://localhost:3000.

**To stop:**
- Press `Ctrl+C` in the terminal running `npm run dev`.
- Stop the containers (keeps your data): `docker compose stop`.

Your data lives in Docker volumes and **persists** between restarts. You do **not** need to re-run steps 5–7 each day.

**To wipe everything and start fresh** (deletes all candidate data):
```bash
docker compose down -v
```
Then re-run steps 4–7.

---

## 6. Command reference

| Command | What it does |
|---|---|
| `npm install` | Install project dependencies (first time / after updates) |
| `docker compose up -d` | Start MySQL + Elasticsearch (creates containers first time) |
| `docker compose ps` | Show container status (look for `healthy`) |
| `docker compose stop` / `start` | Stop / restart containers without deleting data |
| `docker compose down -v` | Remove containers **and delete all data** |
| `npx prisma migrate deploy` | Apply committed DB migrations (then `npx prisma generate`) |
| `npm run es:init` | Create the Elasticsearch index (idempotent) |
| `npm run seed` | Create/update the admin from `.env` |
| `npm run seed:candidates` | Generate 500+ realistic dummy candidates (faker) + index them (safe to re-run) |
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run reindex` | **Drop and rebuild** the search index from MySQL (recovery) |

---

## 7. Troubleshooting

**"Cannot connect to the Docker daemon" / compose fails**
Docker Desktop isn't running. Open it and wait for the tray icon to say it's running, then retry.

**`docker compose ps` shows `starting` forever, or the app can't reach the database**
Give Elasticsearch/MySQL 30–60 seconds on a cold start. Re-check with `docker compose ps`. View logs with `docker compose logs mysql` or `docker compose logs elasticsearch`.

**Port already in use (3306, 9200, or 3000)**
Something else is using that port (e.g. a local MySQL install on 3306). Either stop that program, or change the host port in `docker-compose.yml` (and the matching URL in `.env`). The app port can be changed with `npm run dev -- -p 3001`.

**App loads but search returns nothing or errors**
Elasticsearch probably wasn't ready when you seeded or imported. Rebuild the index from the database:
```bash
npm run reindex
```

**The Candidates page shows "degraded mode"**
That means Elasticsearch is unreachable, so the app fell back to a basic database search (no relevance ranking or facet counts). Make sure the ES container is `healthy`, then reload.

**`prisma migrate` errors about `DATABASE_URL`**
Your `.env` is missing or empty. Redo Step 2.

**Changed the `.env` and nothing happened**
Restart `npm run dev` — environment variables load at startup.

---

## 8. How it works

```
Browser  -->  Next.js API routes  -->  MySQL (Prisma)      [source of truth]
                                   \->  Elasticsearch        [search index]
```

- Every candidate create/update/delete goes through one place (`lib/candidate-service.ts`), which writes to **MySQL first**, then best-effort syncs the **Elasticsearch** document. **If Elasticsearch is down, the database write still succeeds** and the failure is logged — you rebuild the index later with `npm run reindex`.
- The Candidates list searches **Elasticsearch**, not MySQL. If ES is unreachable it transparently falls back to a degraded MySQL search and the UI says so.

---

## 9. Feature guide

### Search
The search box supports boolean syntax, translated to an Elasticsearch query for you:
- `AND`, `OR`, `NOT` (case-insensitive)
- `"quoted phrases"`
- `( parentheses )` for grouping
- implicit `AND` between adjacent words

Example: `react AND ("node.js" OR typescript) NOT intern`

Next to it are faceted filters (skills, tags, status, source, city, experience range, date-added range), sort options (relevance / newest / name), and typeahead suggestions.

### Adding candidates
- **Manually:** *Add Candidate* — full form with skills/tags chip inputs, validation, and optional resume upload that auto-suggests name/email/phone/skills. Warns (doesn't block) if the email/phone already exists.
- **By import:** *Import* page, two ways:
  1. **Spreadsheet** (`.csv` / `.xlsx` / `.xls`) — map detected columns to fields, preview, import. Rows missing first name / last name / email, or with duplicate emails, are skipped and reported.
  2. **Resume files** (PDF / DOCX) — each is parsed for text + details and turned into a candidate.

### Managing candidates
Row click opens the detail/edit page (with an activity log). The list supports per-row delete, bulk select → bulk status change / bulk delete / export selected, and "export filtered" to CSV.

### Resume parsing
Local and heuristic — no paid APIs. `pdf-parse` / `mammoth` extract text; regex/keyword rules suggest email, phone, name, skills, and years of experience.

---

## 10. Project structure

```
app/
  api/                 # route handlers (all session-protected)
    auth/[...nextauth]/
    candidates/        # CRUD, search (GET), bulk, export, suggest, check-duplicate
    import/            # tabular import + /resumes
    resume-parse/      # single-file parse used by the add/edit form
    files/             # streams stored resume files (admin only)
  admin/               # protected UI (candidates, new, [id], import, dashboard)
  login/
components/            # client UI (form, list, facets, import wizard, ...)
lib/                   # prisma, elasticsearch, auth, validators, resume-parser,
                       # boolean-query-parser, storage, candidate-service, search
prisma/                # schema + committed migrations
scripts/               # seed, init-es, reindex
docker-compose.yml     # local MySQL + Elasticsearch
```

---

## 11. Notes & decisions

- **All `/admin/**` routes** are protected by middleware **and** re-checked server-side; every API route verifies the session.
- **`skills` and `tags`** are stored as JSON arrays in MySQL (no native array type) and indexed as keyword arrays in Elasticsearch for exact facet filtering.
- **Resume files** are written through a swappable `StorageDriver` (`lib/storage.ts`). Only the local-disk driver ships in phase 1; moving to S3 later is a new driver + a config change, not a rewrite.
- **Password hashing** uses `bcryptjs` (pure JavaScript) instead of `bcrypt` to avoid native build issues on Windows. Hashes are compatible.
- **Tech stack:** Next.js 14 (App Router, TypeScript strict), Prisma + MySQL, Elasticsearch, Tailwind CSS, NextAuth (Credentials + JWT), `papaparse` + `xlsx`, `pdf-parse` + `mammoth`, `zod`.
- **MySQL host port is 3307** (mapped to the container's 3306) so it won't clash with a MySQL already installed on 3306. Elasticsearch uses 9200, the app uses 3000.
