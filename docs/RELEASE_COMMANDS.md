# Release Commands - v1.0.0

## Prerequisites

1. All changes committed
2. All tests passing (unit + integration)
3. CHANGELOG.md updated with release date
4. README.md ready (Live Demo URL can be updated post-deploy)

## Release Steps

### 1. Final Verification

```bash
# Type check
npm run typecheck

# Unit tests
npm test

# Build
npm run build

# Verify git status
git status
```

### 2. Commit All Changes

```bash
# Add all files
git add .

# Commit with release message
git commit -m "chore: prepare v1.0.0 release

- Complete documentation pack (README, ARCHITECTURE, ADRs, DEPLOYMENT)
- Docker setup with multi-stage build
- GitHub Actions CI with Postgres
- Test strategy split (unit vs integration)
- TypeScript/ESLint compatibility fixes
- Portfolio assets checklist
- Railway deployment guide

See CHANGELOG.md for full details."
```

### 3. Push to Remote

```bash
git push origin main
```

### 4. Create and Push Tag

```bash
# Create annotated tag
git tag -a v1.0.0 -m "Release v1.0.0: Portfolio-ready event-sourced ledger

Features:
- Event-sourced personal ledger with full audit trail
- Account management, income/expense recording, transfers
- JWT authentication with Argon2 password hashing
- Synchronous projections with PostgreSQL
- Optimistic concurrency control
- Command idempotency with result caching
- OpenAPI documentation
- Docker Compose setup
- GitHub Actions CI
- Comprehensive documentation (ARCHITECTURE, ADRs, DEPLOYMENT)

See CHANGELOG.md for complete list of changes."

# Push tag to remote
git push origin v1.0.0
```

### 5. Verify Tag

```bash
# List tags
git tag -l

# Verify tag exists on remote
git ls-remote --tags origin
```

### 6. Create GitHub Release (Optional but Recommended)

1. Go to: https://github.com/ManuelCaserta/Event-Sourced-Personal-Ledger/releases/new
2. Select tag: `v1.0.0`
3. Title: `v1.0.0 - Portfolio Release`
4. Description: Copy from `CHANGELOG.md` v1.0.0 section
5. Check "Set as the latest release"
6. Click "Publish release"

## Post-Release Tasks

### 1. Deploy to Railway

Follow `docs/DEPLOYMENT.md` step-by-step guide.

### 2. Update README with Live Demo URL

After Railway deployment:
1. Get public URL from Railway dashboard
2. Update `README.md`: Replace `https://YOUR-APP-NAME.up.railway.app` with actual URL
3. Commit and push:
   ```bash
   git add README.md
   git commit -m "docs: add live demo URL"
   git push origin main
   ```

### 3. Create Portfolio Assets

Follow `docs/ASSETS.md` checklist:
- `docs/assets/api-docs.png`
- `docs/assets/accounts-view.png`
- `docs/assets/movements-view.png`
- `docs/assets/demo.gif`

### 4. Add Assets to Repository

```bash
# Add assets
git add docs/assets/*.png docs/assets/*.gif

# Commit
git commit -m "docs: add portfolio assets (screenshots and demo GIF)"

# Push
git push origin main
```

## Verification Checklist

- [ ] All tests pass (`npm test`, `npm run test:integration`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] CHANGELOG.md updated with correct date
- [ ] All changes committed
- [ ] Tag `v1.0.0` created and pushed
- [ ] GitHub release created (optional)
- [ ] Railway deployment completed
- [ ] Live demo URL added to README
- [ ] Portfolio assets created and added

## Rollback (If Needed)

If release tag needs to be removed:

```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin --delete v1.0.0
```

Then fix issues and re-tag.

