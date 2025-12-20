# Deployment Guide

## Railway

### Prerequisites

- Railway account (sign up at [railway.app](https://railway.app))
- GitHub repository: `ManuelCaserta/Event-Sourced-Personal-Ledger`

### Step-by-Step Deployment

#### 1. Create Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose repository: `Event-Sourced-Personal-Ledger`
5. Select branch: `main` (or your default branch)

#### 2. Add PostgreSQL Service

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway automatically creates a PostgreSQL instance
4. **Note the `DATABASE_URL`** (you'll need it in step 4)

#### 3. Configure Application Service

1. Railway should have auto-created a service from your GitHub repo
2. If not, click **"+ New"** → **"GitHub Repo"** → select your repo

#### 4. Set Environment Variables

1. Click on your **application service** (not the database)
2. Go to **"Variables"** tab
3. Add the following variables:

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference the Postgres service variable |
   | `JWT_SECRET` | `[generate 32+ char secret]` | Use a secure random string |
   | `NODE_ENV` | `production` | |
   | `PORT` | `3000` | Railway sets this automatically, but explicit is fine |

   **To get `DATABASE_URL`**:
   - Click on the **PostgreSQL service**
   - Go to **"Variables"** tab
   - Copy the value of `DATABASE_URL`
   - Paste it in the application service variables (or use `${{Postgres.DATABASE_URL}}` reference)

      **To generate `JWT_SECRET`**:
   ```bash
   # On Linux/Mac
   openssl rand -base64 32
   
   # Or use any secure random string generator (min 32 characters)
   ```

   **Important**: Railway automatically provides `DATABASE_URL` from the Postgres service. You can reference it as `${{Postgres.DATABASE_URL}}` or copy the actual value.

#### 5. Configure Build and Deploy Commands

1. In your **application service**, go to **"Settings"** tab
2. Scroll to **"Build & Deploy"** section
3. Configure:

   - **Build Command**: `npm ci && npm run build`
   - **Deploy Command**: `npm run db:migrate:prod`
   - **Start Command**: `npm start`

   **Important**: The **Deploy Command** runs migrations **before** the service starts. This ensures the database schema is ready.

#### 6. Deploy

1. Railway automatically deploys on every push to the connected branch
2. Or manually trigger: Click **"Deploy"** → **"Deploy Now"**
3. Watch the **"Deployments"** tab for progress
4. Check **"Logs"** tab to see:
   - Build output
   - Migration logs (should show "✓ Applied migration X")
   - Server startup

#### 7. Get Public URL

1. In your **application service**, go to **"Settings"** tab
2. Scroll to **"Networking"** section
3. Click **"Generate Domain"** (or use the auto-generated one)
4. Copy the public URL (e.g., `https://your-app-name.up.railway.app`)

#### 8. Verify Deployment

Test the endpoints:

```bash
# Health check (should return 200)
curl https://your-app-name.up.railway.app/healthz

# API docs (should show Swagger UI)
open https://your-app-name.up.railway.app/docs
```

Expected responses:
- `/healthz` → `{"status":"ok"}`
- `/docs` → Swagger UI HTML page

#### 9. Update README with Live Demo URL

1. Copy your Railway public URL (from step 7)
2. Open `README.md`
3. Replace `https://YOUR-APP-NAME.up.railway.app` with your actual URL
4. Commit and push:

```bash
git add README.md
git commit -m "docs: add live demo URL"
git push
```

### Troubleshooting

**Migrations not running?**
- Check **"Logs"** tab for migration output
- Look for lines like `✓ Applied migration X: filename.sql`
- Verify `DATABASE_URL` is correctly set
- Ensure `Deploy Command` is set to `npm run db:migrate:prod`
- Verify migrations directory exists: `src/infra/db/migrations/` (should be in repo)

**Service won't start?**
- Check logs for errors
- Verify `JWT_SECRET` is set (min 32 characters)
- Verify `DATABASE_URL` is accessible from the app service
- Check that migrations completed successfully before start

**Database connection errors?**
- Ensure `DATABASE_URL` uses the Railway Postgres service variable
- Check Postgres service is running (green status)
- Verify the app service can reach the Postgres service (same project)

**"No pending migrations" message?**
- This is normal after first deploy
- Migrations are idempotent (safe to run multiple times)
- Check `schema_migrations` table in Postgres to see applied migrations

### Custom Domain

1. Settings → Domains
2. Add custom domain
3. Configure DNS (Railway provides instructions)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (min 32 chars) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` for prod |

## Health Checks

Railway uses `/healthz` endpoint for health checks:
- Returns `200` if DB is reachable
- Returns `500` if DB is unavailable

## Monitoring

- Railway dashboard shows logs, metrics
- Check migration logs on first deploy
- Monitor `/healthz` endpoint

## Rollback

1. Railway dashboard → Deployments
2. Select previous deployment
3. Click "Redeploy"

