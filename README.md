# You and Gee - Offline-First POS with Cloudflare D1 Sync

A Svelte 5 + SvelteKit offline-first Point of Sale application featuring event-sourcing stock ledger, Cloudflare D1 synchronization, and local reporting.

## Architecture

- **Offline-first**: Dexie/IndexedDB for local persistence, works without network — logging in requires a network connection once, after which the app works fully offline
- **Event Sourcing**: Immutable stock operations (`quantityChange` deltas) instead of absolute values, keyed by the product's canonical `uuid` (not any device's local numeric id)
- **Cloudflare D1 Sync**: Bidirectional sync for products (last-write-wins), orders (immutable, insert-only), and stock movements — all via Cloudflare Pages Functions, not SvelteKit server routes (see below)
- **Auth**: A single login credential gates every sync endpoint (`functions/api/_middleware.ts`); local POS operation itself is never gated by login, only the network sync calls are
- **PWA**: Service worker + manifest for installable offline experience
- **adapter-static + Pages Functions**: The app itself is a static client-side SPA; server-side logic (sync, auth) lives entirely in `functions/`, Cloudflare's own routing convention — not SvelteKit's `+server.ts` routes, which a static adapter cannot serve

## Tech Stack

- Svelte 5 (Runes: `$state`, `$derived`, `$effect`)
- SvelteKit with `@sveltejs/adapter-static`
- Dexie.js for IndexedDB
- Cloudflare D1 (serverless SQLite) + Cloudflare Pages Functions
- Wrangler for deployment
- Vitest for testing
- TailwindCSS v4
- TypeScript

## Getting Started

### Local Development

```bash
npm install
npm run dev
```

This runs the static SPA against your local IndexedDB — sync/auth calls will fail without a local D1 + Functions setup (see `llm/DEPLOY.md`).

### Verification Gate

```bash
npm run check            # SvelteKit/TypeScript (src/)
npm run check:functions  # Pages Functions (functions/) — separate tsconfig, not covered by the above
npm run lint
npm test
npm run build
```

---

## Cloudflare Pages Deployment

Full step-by-step instructions — including the auth secret and login credential setup this app requires — are in **[`llm/DEPLOY.md`](./llm/DEPLOY.md)**. Short version:

1. `npx wrangler login`, create a D1 database, set `database_id` in `wrangler.toml`
2. `npx wrangler d1 migrations apply youandgee-db --remote` (ordered migration files under `migrations/`, tracked by D1 itself — not a single schema file re-run each time)
3. `npx wrangler pages secret put SESSION_SECRET --project-name=youandgee`
4. `node scripts/generate-credential-sql.mjs <username> <password>`, then run the SQL it prints against your D1
5. Deploy via the GitHub Actions `workflow_dispatch`, or `npx wrangler pages deploy build --project-name=youandgee` directly

---

## CI/CD with GitHub Actions

`.github/workflows/deploy.yml`:
- Type checking (`npm run check` + `npm run check:functions`), linting, tests, build — on every push and PR
- Preview deploy on PRs
- Production deploy (migrations + Pages deploy) only on a manual `workflow_dispatch` — pushing to `main` alone does not deploy to production

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN` - API token with Pages + D1 permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

---

## Project Structure

```
src/
├── lib/
│   ├── db.ts              # Dexie schema + migrations
│   ├── sync.ts             # Client sync (push/pull for products, orders, stock movements)
│   ├── client-auth.ts       # Session token storage + login (client side)
│   ├── domain/              # Pure, unit-tested business logic (money, ids, stock projection/report, sync status)
│   ├── exports/              # CSV generation (RFC 4180 quoting + formula-injection neutralization)
│   ├── server/                # Business logic shared by functions/ (validation, auth, push/pull handlers)
│   └── components/             # Shared Svelte components (receipt view, sync badge, login wall)
├── routes/
│   ├── +page.svelte         # POS page (sales)
│   ├── +layout.svelte        # Login gate + sync-on-mount/reconnect
│   ├── inventory/             # Stock management
│   ├── reports/                # Stock-movement reports + CSV export
│   └── orders/                  # Order history + receipt reprint
├── app.d.ts                 # Platform.env.DB typing
└── app.html                  # HTML template

functions/                    # Cloudflare Pages Functions — the actual server side (NOT src/routes/api)
├── _middleware.ts             # Auth gate on every /api/* route except /api/auth/login
├── api/
│   ├── auth/login.ts
│   ├── products/{push,pull}.ts
│   ├── orders/{push,pull}.ts
│   ├── syncs.ts                # Stock movement push
│   └── sync/pull.ts             # Stock movement pull

migrations/                    # Ordered, numbered D1 migrations (NOT a single schema file)
└── 0001_initial_schema.sql, 0002_..., ...

scripts/
└── generate-credential-sql.mjs # Seeds the login credential — no bootstrap API endpoint exists

wrangler.toml                  # Cloudflare Pages + D1 config
llm/DEPLOY.md                   # Detailed deployment guide
```

---

## Sync Flow

```
┌─────────────┐  Authorization: Bearer <token>  ┌───────────────────┐     ┌──────────────┐
│  Browser    │ ───────────────────────────────▶│ Cloudflare Pages  │────▶│  Cloudflare  │
│  (Dexie)    │  products/orders/stock push+pull │ Functions          │     │      D1      │
│             │ ◀───────────────────────────────│ (functions/api/*)  │     │              │
│ - synced:   │                                  │ - _middleware.ts:  │     │ - products   │
│   0/1/-1    │                                  │   auth gate        │     │ - orders     │
│   per entity│                                  │ - validates every  │     │ - stock_     │
└─────────────┘                                  │   mutation's shape │     │   ledger     │
                                                  └───────────────────┘     │ - credentials│
                                                                            └──────────────┘
```

`syncWithCloud()` (`src/lib/sync.ts`) runs products, then stock movements, then orders — a movement for a product this device hasn't seen can only resolve once that product itself has synced. Runs on app mount, on the browser `online` event, and as a side effect of any local write, whenever a valid session token exists.

---

## Key Features

| Feature | Implementation |
|---------|---------------|
| Offline sales | Dexie local write → `synced: 0` → background sync when online and logged in |
| Multi-device | Each device pushes unsynced work, pulls remote deltas since its own cursor |
| Product conflicts | Last-write-wins by `updatedAt`, arbitrated both server-side (D1 `WHERE updated_at < excluded.updated_at`) and client-side (a stale pull can't clobber a newer unsynced local edit) |
| Order integrity | Immutable — push is insert-only (`ON CONFLICT(uuid) DO NOTHING`), idempotent under retry |
| Stock accuracy | Balance is a rebuildable projection over the movement ledger, never a second authority that could drift from it |
| Reports | Local Dexie queries (date-range stock report with opening/closing balances) + CSV export |
| Auth | Single login credential, PBKDF2-hashed, HMAC-signed session tokens — no user accounts/roles system, matches single-operator usage |

---

## Useful Commands

```bash
# Type check (src/ and functions/ are checked separately — see Verification Gate above)
npm run check
npm run check:functions

# Lint, test, build
npm run lint
npm test
npm run build

# Preview production build
npm run preview

# View D1 data (remote)
npx wrangler d1 execute youandgee-db --remote --command="SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 20;"
npx wrangler d1 execute youandgee-db --remote --command="SELECT * FROM products;"

# Tail function logs
npx wrangler pages functions tail youandgee
```

See **[`llm/DEPLOY.md`](./llm/DEPLOY.md)** for the full deployment guide, troubleshooting, and architecture summary.
