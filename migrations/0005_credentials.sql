-- Login credentials. Only one row exists today (this is an internal,
-- single-operator tool), but that's a current usage fact, not a schema
-- constraint — nothing here stops adding more accounts later. Populated
-- directly via `wrangler d1 execute` (see scripts/generate-credential-sql.mjs),
-- never through an API endpoint.

CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
