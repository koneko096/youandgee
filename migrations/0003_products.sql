-- Products table, redesigned for actual sync use (it was defined in
-- 0001_initial_schema.sql but never read or written by any query — grep
-- confirms it). Keyed by the client-generated canonical uuid (KTD1), not a
-- server-assigned autoincrement id, so a product created offline never needs
-- renumbering to converge across devices. Stock is deliberately absent: it
-- stays a rebuildable projection over stock_ledger (KTD1, KTD2), never a
-- second authority a product row could disagree with.

DROP TABLE IF EXISTS products;
CREATE TABLE IF NOT EXISTS products (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,        -- integer minor units (KTD3)
    archived INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL       -- server-recorded write time; arbitrates last-write-wins (KTD7)
);

CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);
