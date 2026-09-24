-- Orders table, redesigned for actual sync use (like products before it,
-- defined in 0001_initial_schema.sql but never read or written by any
-- query). Keyed by the client-generated canonical uuid (KTD1). Orders are
-- immutable once created (R3) — sync is append-only, never an update, which
-- also makes push naturally idempotent under retry (AE2).

DROP TABLE IF EXISTS orders;
CREATE TABLE IF NOT EXISTS orders (
    uuid TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    customer_name TEXT,
    total INTEGER NOT NULL,        -- integer minor units (KTD3)
    items TEXT NOT NULL,           -- JSON array of {name, price, quantity}
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
