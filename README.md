# You and Gee - Offline-First POS with Cloudflare D1 Sync

A Svelte 5 + SvelteKit offline-first Point of Sale application featuring event-sourcing stock ledger, Cloudflare D1 synchronization, and local reporting.

## Architecture

- **Offline-first**: Dexie/IndexedDB for local persistence, works without network
- **Event Sourcing**: Immutable stock operations (`quantityChange` deltas) instead of absolute values
- **Cloudflare D1 Sync**: Bidirectional sync with idempotent batch operations
- **Materialized View**: `product_stock_summary` table for O(1) stock lookups
- **PWA**: Service worker + manifest for installable offline experience
- **adapter-static**: Pure client-side SPA deployed to Cloudflare Pages

## Tech Stack

- Svelte 5 (Runes: `$state`, `$derived`, `$effect`)
- SvelteKit with `@sveltejs/adapter-static`
- Dexie.js for IndexedDB
- Cloudflare D1 (serverless SQLite)
- Wrangler for deployment
- TailwindCSS v4
- TypeScript

## Getting Started

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

### Local Development with D1

```bash
# Start local D1 database
wrangler dev --local --persist-to=./.wrangler/state --port=8788

# In another terminal, start Vite
npm run dev
```

---

## Cloudflare Pages Deployment

### Prerequisites

- Cloudflare account
- Wrangler CLI: `npm install -g wrangler`

### One-time Setup

```bash
# 1. Authenticate
wrangler login

# 2. Create D1 database
wrangler d1 create youandgee-db
# Copy the database_id from output

# 3. Update wrangler.toml with database_id
# [[d1_databases]]
# binding = "DB"
# database_name = "youandgee-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# 4. Apply schema to D1
wrangler d1 execute youandgee-db --remote --file=migrations/d1_schema.sql
```

### Deploy

```bash
# Build for production
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy build --project-name=youandgee
```

### Configure D1 Binding in Pages Dashboard

After first deploy:
1. Go to **Pages → youandgee → Settings → Functions → D1 Database Bindings**
2. Add binding: **Variable name** = `DB`, **Database** = `youandgee-db`
3. Save (triggers redeploy)

---

## CI/CD with GitHub Actions

The `.github/workflows/deploy.yml` handles:
- Type checking (`pnpm run check`)
- Linting (`pnpm run lint`)
- Build (`pnpm run build`)
- Preview deployments for PRs
- Production deployment on main branch push
- Automatic D1 migrations on production deploy

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` - API token with Pages + D1 permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

---

## Project Structure

```
src/
├── lib/
│   ├── db.ts           # Dexie schema + event-sourcing ledger
│   ├── sync.ts         # Client sync manager (push/pull)
│   └── index.ts        # Exports
├── routes/
│   ├── +page.svelte    # POS page (sales)
│   ├── +layout.svelte  # Layout with nav
│   ├── +layout.ts      # Sync initialization
│   ├── inventory/      # Stock management
│   ├── reports/        # Offline-capable reports
│   ├── orders/         # Order history
│   └── api/
│       ├── syncs/      # POST /api/syncs - batch push
│       └── sync/pull/  # GET /api/sync/pull - delta pull
├── app.d.ts            # Platform.env.DB typing
├── app.html            # HTML template
└── service-worker.js   # PWA registration

migrations/
└── d1_schema.sql       # D1 schema (stock_ledger, product_stock_summary, etc.)

wrangler.toml           # Cloudflare Pages + D1 config
DEPLOY.md               # Detailed deployment guide
```

---

## Sync Flow

```
┌─────────────┐     POST /api/syncs     ┌──────────────┐     ┌──────────────┐
│  Browser    │ ─────────────────────▶ │ Cloudflare   │ ───▶ │   Cloudflare │
│  (Dexie)    │  { operations[] }      │  Pages       │      │     D1       │
│             │                        │  (API)       │      │              │
│ - synced:0  │ ◀───────────────────── │              │      │ - stock_     │
│ - UUID ops  │  { processedIds[] }    │ - batch tx   │      │   ledger     │
└─────────────┘                        │ - summary    │      │ - product_   │
       │                              │   update     │      │   stock_     │
       │                              └──────────────┘      │   summary    │
       │ GET /api/sync/pull?since=ts                         └──────────────┘
       │ ─────────────────────────────▶
       │ ◀───────────────────────────── { newOperations[], timestamp }
       ▼
  Merge remote ops (dedupe by UUID)
```

---

## Key Features

| Feature | Implementation |
|---------|---------------|
| Offline sales | Dexie local write → `synced: 0` → background sync |
| Multi-device | Each device pushes unsynced, pulls delta since last sync |
| Conflict-free | Client UUIDs + `ON CONFLICT(id) DO NOTHING` = idempotent |
| Fast reads | `product_stock_summary` materialized in same D1 transaction |
| Reports | Local Dexie queries (offline) + D1 SQL (central) |

---

## Useful Commands

```bash
# Type check
npm run check

# Lint
npm run lint

# Build
npm run build

# Preview production build
npm run preview

# View D1 data (remote)
wrangler d1 execute youandgee-db --remote --command="SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 20;"

# View materialized summary
wrangler d1 execute youandgee-db --remote --command="SELECT * FROM product_stock_summary;"

# Tail function logs
wrangler pages functions tail youandgee
```