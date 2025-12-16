# Deployment (Railway)

This guide deploys the API to Railway with a managed Postgres database and automatic migrations via **Pre-Deploy Command**.

## Prerequisites

- A GitHub repo: `ManuelCaserta/Event-Sourced-Personal-Ledger`
- Railway account

## 1) Create the Railway project

1. In Railway: **New Project** → **Deploy from GitHub repo**
2. Select `ManuelCaserta/Event-Sourced-Personal-Ledger`

Railway will detect Node and build the app.

## 2) Add Postgres

1. In the same Railway project: **New** → **Database** → **PostgreSQL**
2. Railway will automatically inject `DATABASE_URL` into the app service (or you can link it from the Variables UI).

## 3) Configure environment variables

In your **app service** → **Variables**, set:

- `NODE_ENV=production`
- `JWT_SECRET=<long-random-secret>`

Verify `DATABASE_URL` is present (provided by Railway Postgres).

## 4) Configure build / start commands

In your **app service** → **Settings**:

- **Build Command**:
  - `npm ci && npm run build`
- **Start Command**:
  - `npm run start`

## 5) Run migrations automatically (Pre-Deploy Command)

In your **app service** → **Settings**:

- **Pre-Deploy Command**:
  - `npm run db:migrate:prod`

This runs `dist/infra/db/migrate.js` against Railway’s `DATABASE_URL` before the new release goes live.

## 6) Generate a public URL

1. In the app service: **Settings** → **Domains**
2. Generate a Railway domain (or add a custom domain)

## 7) Verify the deployment

Open:

- `GET /healthz`  
  - Expected: `200 { "status": "ok" }` (DB ping with ~2s timeout)
- `GET /docs`  
  - Expected: Swagger UI

If `/healthz` returns `500 { code: "DB_UNAVAILABLE", ... }`, check:

- Postgres service is running
- `DATABASE_URL` is linked to the app service
- Pre-deploy migrations succeeded

## 8) Update README “Live Demo”

After you have the public URL, replace the placeholder in `README.md` with your Railway domain.


