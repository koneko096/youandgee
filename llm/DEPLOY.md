# Cloudflare Pages + D1 Deployment Guide

## Prerequisites

1. Cloudflare account with Pages/D1 access
2. Wrangler CLI: `npm install -D wrangler` (already a devDependency — `npx wrangler` works without a global install)
3. Node.js 20+ and npm (this project uses npm — `package-lock.json` is the lockfile; there is no pnpm anywhere in this project)

---

## Step 1: Authenticate Wrangler

```bash
npx wrangler login
```

---

## Step 2: Create D1 Database

```bash
npx wrangler d1 create youandgee-db
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

## Step 3: Apply D1 Migrations

Schema changes live as ordered, numbered files under `migrations/` (`0001_initial_schema.sql`, `0002_...`, etc.), tracked by Cloudflare's own D1 migrations system — **not** a single schema file re-executed each time. Applying is idempotent: it only runs migrations D1 hasn't recorded as applied yet.

```bash
# Local development (requires local D1 via `wrangler dev`)
npx wrangler d1 migrations apply youandgee-db --local

# Production (remote)
npx wrangler d1 migrations apply youandgee-db --remote
```

Adding a schema change later: create a new `NNNN_description.sql` file (next number in sequence) rather than editing an existing one, and re-run `migrations apply`.

Verify tables created:
```bash
npx wrangler d1 execute youandgee-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

---

## Step 4: Set the Session Secret

The sync/auth middleware (`functions/api/_middleware.ts`) signs and verifies session tokens with an HMAC secret that must exist as a Cloudflare secret. Without it, every login attempt fails.

```bash
npx wrangler pages secret put SESSION_SECRET --project-name=youandgee
```
(paste any long random string when prompted)

---

## Step 5: Create the Login Credential

There is **no signup/bootstrap API endpoint** by design — an open bootstrap route would let anyone race to claim the first account before you do. Instead, generate the hash yourself and insert it directly:

```bash
node scripts/generate-credential-sql.mjs <username> <password>
```

This prints a ready-to-run `wrangler d1 execute ... INSERT INTO credentials ...` command using the exact PBKDF2 parameters the server verifies against. Copy and run it yourself — the script never sends anything over the network itself.

The `credentials` table is *not* limited to one row by schema (no such constraint exists) — today's single-operator usage is a fact about how the app is used, not something baked into the database.

---

## Step 6: Build the Project

```bash
npm install
npm run build
```

Output goes to `build/` (configured in `wrangler.toml` as `pages_build_output_dir`). Before deploying, it's worth running the full local gate that CI also runs:

```bash
npm run check            # SvelteKit/TypeScript
npm run check:functions  # Pages Functions have their own tsconfig — svelte-check does not cover functions/
npm run lint
npm test
npm run build
```

---

## Step 7: Deploy to Cloudflare Pages

### Option A: Via Wrangler CLI (direct deploy)

```bash
npx wrangler pages deploy build --project-name=youandgee
```

### Option B: Via GitHub Actions (what this repo actually uses)

`.github/workflows/deploy.yml` runs the full check/lint/test/build gate on every push and PR. Production deploy (migrations + Pages deploy) only runs on a manual trigger:

```bash
gh workflow run "Deploy to Cloudflare Pages" --repo <owner>/<repo>
```
or trigger it from the Actions tab in GitHub (`workflow_dispatch`).

**Required GitHub Secrets:** `CLOUDFLARE_API_TOKEN` (Pages + D1 permissions), `CLOUDFLARE_ACCOUNT_ID`.

### Option C: Via Git Integration (Cloudflare Dashboard)

1. Push repo to GitHub
2. Cloudflare Dashboard → Pages → **Connect to Git**
3. Build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `build`
4. Deploy

---

## Step 8: Configure D1 Binding in Pages Dashboard

After first deploy, go to **Pages → your-project → Settings → Functions → D1 Database Bindings**:

1. Click **Add binding**
2. **Variable name**: `DB` (must match `binding = "DB"` in `wrangler.toml`)
3. **Database**: Select `youandgee-db`
4. Save → triggers new deployment

---

## Step 9: Verify Deployment

1. Visit your Pages URL — you should land on a full-page login wall, not the POS (if you see the POS directly without logging in, something is wrong with the auth deploy)
2. Log in with the credential from Step 5
3. Make a sale → Network tab → `/api/products/push`, `/api/syncs`, `/api/orders/push` should each return `200`
4. Refresh → data persists via IndexedDB, and you stay logged in (session token in localStorage)
5. Open a second browser/device, log in there too, and confirm a product/order created on one appears on the other after both sync

---

## Local Development with D1

```bash
# Start local D1 + Vite dev server
npx wrangler dev --local --persist-to=./.wrangler/state --port=8788

# In another terminal
npm run dev
```

- Local D1 at `http://localhost:8788` (proxied through Vite)
- Local DB file at `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/youandgee-db.sqlite`
- Remember Steps 3-5 above apply locally too (`--local` instead of `--remote`) if you want auth/sync to work in local dev

---

## Sync Behavior

| Scenario | Behavior |
|----------|----------|
| Offline sale | Stored in Dexie with `synced: 0`, auto-syncs when online and logged in |
| Multi-device | Each device pushes unsynced products/orders/stock movements, pulls remote deltas |
| Products | Last-write-wins by `updatedAt` (both client- and server-arbitrated) |
| Orders | Immutable — push is insert-only (`ON CONFLICT(uuid) DO NOTHING`), never an update |
| Stock movements | Keyed by the product's canonical `uuid`, not any device's local numeric id |
| Auth | Every `/api/*` route except `/api/auth/login` requires a valid bearer token (`functions/api/_middleware.ts`) |
| Server-rejected data | Client marks it `synced: -1` (not retried forever), logs it, never silently drops it |

---

## Troubleshooting

### D1 Binding undefined in API routes
- Ensure `DB` binding added in **Pages → Settings → Functions → D1 Database Bindings**
- Redeploy after adding binding
- Check `src/app.d.ts` has the correct `Platform` interface

### Login fails / "invalid credentials"
- Confirm `SESSION_SECRET` is actually set (`wrangler pages secret list --project-name=youandgee`)
- Confirm the credential row exists: `wrangler d1 execute youandgee-db --remote --command="SELECT username FROM credentials;"`
- Username/password are case-sensitive and checked against exactly what you hashed in Step 5

### Sync not working
- Check the browser console — sync failures are logged there ("Not logged in — ... deferred", rejection errors, etc.), never silent
- Confirm you're actually logged in — an expired/cleared session silently defers sync rather than erroring loudly
- Verify `/api/products/pull`, `/api/sync/pull`, `/api/orders/pull` return `200` (not `401`) with a valid token in Network tab

### Build fails
- Run `npm run check` and `npm run check:functions` separately — they cover different directories (`src/` vs `functions/`) and a failure in one won't show up in the other
- Ensure `@sveltejs/adapter-static` is in devDependencies (this app is a static SPA; only `functions/` is server code)

---

## Useful Commands

```bash
# View D1 data
npx wrangler d1 execute youandgee-db --remote --command="SELECT * FROM stock_ledger ORDER BY created_at DESC LIMIT 20;"
npx wrangler d1 execute youandgee-db --remote --command="SELECT * FROM products;"
npx wrangler d1 execute youandgee-db --remote --command="SELECT * FROM orders ORDER BY created_at DESC LIMIT 20;"

# List applied/pending migrations
npx wrangler d1 migrations list youandgee-db --remote

# Tail Pages function logs
npx wrangler pages functions tail youandgee

# List deployments
npx wrangler pages deployment list --project-name=youandgee

# Rollback deployment
npx wrangler pages deployment rollback --project-name=youandgee <deployment-id>
```

---

## Architecture Summary

```
┌─────────────┐   POST/GET /api/*   ┌──────────────────────┐     ┌──────────────┐
│  Browser    │ ──────────────────▶ │ Cloudflare Pages     │────▶│  Cloudflare  │
│  (Dexie)    │  Authorization:     │ Functions             │     │      D1      │
│             │  Bearer <token>     │ (functions/api/*)     │     │              │
│ - offline   │ ◀────────────────── │                        │     │ - stock_     │
│   first     │                     │ - _middleware.ts:      │     │   ledger     │
│ - synced    │                     │   auth gate on every   │     │ - products   │
│   flag per  │                     │   route but /auth/login│     │ - orders     │
│   entity    │                     │ - auth/login           │     │ - credentials│
└─────────────┘                     │ - products/{push,pull} │     └──────────────┘
                                     │ - orders/{push,pull}   │
                                     │ - syncs, sync/pull      │
                                     └──────────────────────┘
```

**Sync flow** (`src/lib/sync.ts`'s `syncWithCloud()`, run on app mount, on the `online` event, and after any local write):
1. Push local products (`synced: 0`) → server upserts with last-write-wins by `updatedAt`
2. Pull remote products since last cursor → client applies only if newer than its own local copy
3. Push local stock movements, keyed by product `uuid` (not any device's local id)
4. Pull remote stock movements → resolved to this device's own product row by `uuid`; skipped (not guessed) if unresolvable
5. Push local orders (insert-only, idempotent under retry) → pull remote orders (insert-only, immutable)

Every push/pull carries the bearer token; a `401` clears the stored token immediately rather than retrying with a token the server has already rejected.
