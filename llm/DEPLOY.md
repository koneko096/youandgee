# Cloudflare Pages + D1 Deployment Guide

## Prerequisites

1. Cloudflare account with Workers/Pages access
2. Wrangler CLI installed: `npm install -g wrangler`
3. Node.js 20+ and pnpm/npm

---

## Step 1: Authenticate Wrangler

```bash
wrangler login
```

---

## Step 2: Create D1 Database

```bash
wrangler d1 create youandgee-db
```

**Output example:**
```
Created database youandgee-db with ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Copy the `database_id` and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "youandgee-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # <-- paste here
```

---

## Step 3: Apply D1 Schema

Run the schema migration against your D1 database:

```bash
# Local development (requires local D1 via `wrangler dev`)
wrangler d1 execute youandgee-db --local --file=migrations/d1_schema.sql

# Production (remote)
wrangler d1 execute youandgee-db --remote --file=migrations/d1_schema.sql
```

Verify tables created:
```bash
wrangler d1 execute youandgee-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

---

## Step 4: Build the Project

```bash
pnpm install
pnpm run build
```

Output goes to `build/` directory (configured in `wrangler.toml` as `pages_build_output_dir`).

---

## Step 5: Deploy to Cloudflare Pages

### Option A: Via Wrangler CLI (direct deploy)

```bash
wrangler pages deploy build --project-name=youandgee
```

### Option B: Via Git Integration (recommended for CI/CD)

1. Push repo to GitHub/GitLab
2. In Cloudflare Dashboard → Pages → **Connect to Git**
3. Select repository
4. Build settings (auto-detected from `wrangler.toml`):
   - **Build command**: `pnpm run build`
   - **Build output directory**: `build`
   - **Root directory**: `/` (or subfolder if monorepo)
5. Add **Environment variable** (if needed):
   - `NODE_ENV` = `production`
6. Deploy!

---

## Step 6: Configure D1 Binding in Pages Dashboard

After first deploy, go to **Pages → your-project → Settings → Functions → D1 Database Bindings**:

1. Click **Add binding**
2. **Variable name**: `DB` (must match `binding = "DB"` in `wrangler.toml`)
3. **Database**: Select `youandgee-db`
4. Save → triggers new deployment

---

## Step 7: Verify Deployment

1. Visit your Pages URL: `https://youandgee.pages.dev`
2. Test POS → make a sale
3. Check **Network tab** → `/api/syncs` POST should return `200` with `processedIds`
4. Refresh → data persists via IndexedDB
5. Open second browser/device → verify sync works

---

## Local Development with D1

```bash
# Start local D1 + Vite dev server
wrangler dev --local --persist-to=./.wrangler/state --port=8788

# In another terminal
pnpm run dev
```

- Local D1 at `http://localhost:8788` (proxied through Vite)
- Local DB file at `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/youandgee-db.sqlite`

---

## Sync Behavior

| Scenario | Behavior |
|----------|----------|
| Offline sale | Stored in Dexie with `synced: 0`, auto-syncs when online |
| Multi-device | Each device pushes unsynced ops, pulls remote deltas via `/api/sync/pull` |
| Conflict resolution | `ON CONFLICT(id) DO NOTHING` ensures idempotent replay |
| Materialized view | `product_stock_summary` updated atomically in same D1 batch |

---

## Troubleshooting

### D1 Binding undefined in API routes
- Ensure `DB` binding added in **Pages → Settings → Functions → D1 Database Bindings**
- Redeploy after adding binding
- Check `src/app.d.ts` has correct `Platform` interface

### Sync not working
- Check browser console for fetch errors
- Verify `/api/syncs` and `/api/sync/pull` return 200 in Network tab
- Ensure D1 database has `stock_ledger` and `product_stock_summary` tables

### Build fails
- Run `pnpm run check` for TypeScript/Svelte errors
- Ensure `@sveltejs/adapter-static` in devDependencies

---

## Useful Commands

```bash
# View D1 data
wrangler d1 execute youandgee-db --remote --command="SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 20;"

# View materialized summary
wrangler d1 execute youandgee-db --remote --command="SELECT * FROM product_stock_summary;"

# Tail Pages function logs
wrangler pages functions tail youandgee

# List deployments
wrangler pages deployment list --project-name=youandgee

# Rollback deployment
wrangler pages deployment rollback --project-name=youandgee <deployment-id>
```

---

## Architecture Summary

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browser    │────▶│ Cloudflare   │────▶│   Cloudflare │
│  (Dexie)    │     │  Pages       │     │     D1       │
│             │     │  (API routes)│     │              │
│ - offline   │     │              │     │ - stock_     │
│   first     │     │ - POST /     │     │   ledger     │
│ - UUID ops  │     │   api/syncs  │     │ - product_   │
│ - synced    │     │ - GET /api/  │     │   stock_     │
│   flag      │     │   sync/pull  │     │   summary    │
└─────────────┘     └──────────────┘     └──────────────┘
```

**Sync flow:**
1. Device creates operation → local Dexie (`synced: 0`)
2. Online → `pushLocalOperations()` POSTs batch to `/api/syncs`
3. D1 inserts to `stock_ledger` + updates `product_stock_summary` atomically
4. Returns `processedIds` → client marks `synced: 1`
5. Background `pullRemoteUpdates()` GETs `/api/sync/pull?since=lastSync`
6. Merges remote ops into local Dexie (deduplicated by UUID)