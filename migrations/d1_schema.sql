-- Cloudflare D1 Schema for Event Sourcing Stock Ledger
-- Run this in Cloudflare D1 console or via migrations

-- Primary audit log table for all stock operations
CREATE TABLE stock_ledger (
    id TEXT PRIMARY KEY,           -- Client-generated UUID
    product_id INTEGER NOT NULL,   -- Reference to product
    quantity_change INTEGER NOT NULL, -- +50 (restock), -2 (sale)
    created_at TEXT NOT NULL,      -- ISO timestamp
    reason TEXT DEFAULT 'adjustment' -- 'sale' | 'restock' | 'adjustment' | 'return'
);

-- Index for efficient time-range queries
CREATE INDEX idx_stock_ledger_timestamp ON stock_ledger(created_at);
CREATE INDEX idx_stock_ledger_product ON stock_ledger(product_id);

-- Materialized summary table for O(1) current stock lookups
CREATE TABLE product_stock_summary (
    product_id INTEGER PRIMARY KEY,
    current_stock INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

-- Products table (synced from client or managed in D1)
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Optional: Orders table for reporting
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    customer_name TEXT,
    total REAL NOT NULL,
    items TEXT NOT NULL, -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);