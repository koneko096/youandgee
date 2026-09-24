-- Rekey stock movements (and their materialized summary) to the product's
-- canonical uuid (KTD1) instead of the device-local numeric productId a
-- client used to send — that id has no meaning on any device other than the
-- one that wrote it, which made cross-device stock sync silently wrong.

ALTER TABLE stock_ledger ADD COLUMN product_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product_uuid ON stock_ledger(product_uuid);

DROP INDEX IF EXISTS idx_stock_ledger_product;
ALTER TABLE stock_ledger DROP COLUMN product_id;

-- product_stock_summary was keyed by product_id and is a write-only
-- materialized cache no app code currently reads — safe to rebuild keyed by
-- product_uuid rather than attempt a meaningless data carry-over.
DROP TABLE IF EXISTS product_stock_summary;
CREATE TABLE IF NOT EXISTS product_stock_summary (
    product_uuid TEXT PRIMARY KEY,
    current_stock INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
