import { describe, expect, it, vi } from 'vitest';
import { pullStockOperations, pushStockOperations, type D1Like } from './sync-handlers';

function fakeDb(overrides: Partial<D1Like> = {}): D1Like {
    return {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] })
        }),
        batch: vi.fn().mockResolvedValue([]),
        ...overrides
    };
}

describe('pushStockOperations', () => {
    it('returns success with no processed ids when there is nothing to push', async () => {
        const db = fakeDb();
        const result = await pushStockOperations(db, []);
        expect(result).toEqual({ success: true, processedIds: [] });
        expect(db.batch).not.toHaveBeenCalled();
    });

    it('writes both the ledger and the summary batch, then reports every processed id', async () => {
        const db = fakeDb();
        const operations = [
            { id: 'op-1', productId: 1, quantityChange: -2, timestamp: '2026-01-01T00:00:00.000Z', reason: 'sale' as const },
            { id: 'op-2', productId: 2, quantityChange: 5, timestamp: '2026-01-01T00:00:01.000Z' }
        ];

        const result = await pushStockOperations(db, operations);

        expect(result).toEqual({ success: true, processedIds: ['op-1', 'op-2'] });
        // One batch for the ledger insert, one batch for the summary upsert.
        expect(db.batch).toHaveBeenCalledTimes(2);
    });

    it('defaults a missing reason to adjustment when preparing the ledger insert', async () => {
        const bind = vi.fn().mockReturnThis();
        const db = fakeDb({ prepare: vi.fn().mockReturnValue({ bind, all: vi.fn() }) });

        await pushStockOperations(db, [
            { id: 'op-1', productId: 1, quantityChange: 1, timestamp: '2026-01-01T00:00:00.000Z' }
        ]);

        expect(bind).toHaveBeenCalledWith('op-1', 1, 1, '2026-01-01T00:00:00.000Z', 'adjustment');
    });

    it('includes updated_at when upserting the summary row, satisfying its NOT NULL constraint', async () => {
        const preparedSql: string[] = [];
        const bind = vi.fn().mockReturnThis();
        const db = fakeDb({
            prepare: vi.fn().mockImplementation((sql: string) => {
                preparedSql.push(sql);
                return { bind, all: vi.fn() };
            })
        });

        await pushStockOperations(db, [
            { id: 'op-1', productId: 1, quantityChange: 1, timestamp: '2026-01-01T00:00:00.000Z' }
        ]);

        const summarySql = preparedSql.find((sql) => sql.includes('product_stock_summary'));
        expect(summarySql).toContain('updated_at');
        // Bind call order: ledger insert first, then the summary upsert.
        const summaryBindArgs = bind.mock.calls[1];
        expect(summaryBindArgs).toHaveLength(3);
        expect(summaryBindArgs[2]).toEqual(expect.any(String));
    });
});

describe('pullStockOperations', () => {
    it('returns remote operations since the given cursor plus a fresh timestamp', async () => {
        const rows = [{ id: 'op-9', productId: 1, quantityChange: 3, timestamp: '2026-02-01T00:00:00.000Z', reason: 'restock' }];
        const db = fakeDb({
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnThis(),
                all: vi.fn().mockResolvedValue({ results: rows })
            })
        });

        const result = await pullStockOperations(db, '2026-01-01T00:00:00.000Z');

        expect(result.newOperations).toEqual(rows);
        expect(result.timestamp).toEqual(expect.any(String));
    });

    it('returns an empty array when the query yields no results', async () => {
        const db = fakeDb();
        const result = await pullStockOperations(db, '2026-01-01T00:00:00.000Z');
        expect(result.newOperations).toEqual([]);
    });
});
