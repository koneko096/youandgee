import { describe, expect, it, vi } from 'vitest';
import { pullProducts, pushProducts, type D1Like } from './product-sync';

function fakeDb(overrides: Partial<D1Like> = {}): D1Like {
    return {
        prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(null)
        }),
        batch: vi.fn().mockResolvedValue([]),
        ...overrides
    };
}

const VALID_PRODUCT = {
    uuid: 'product-uuid-1',
    name: 'Widget',
    price: 1000,
    archived: false,
    updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('pushProducts', () => {
    it('accepts a well-formed product and reports it processed', async () => {
        const db = fakeDb();
        const result = await pushProducts(db, [VALID_PRODUCT]);
        expect(result.success).toBe(true);
        expect(result.processedUuids).toEqual(['product-uuid-1']);
        expect(result.rejected).toEqual([]);
    });

    it('rejects a product with an invalid shape without writing it', async () => {
        const db = fakeDb();
        const result = await pushProducts(db, [{ ...VALID_PRODUCT, price: -5 }]);
        expect(result.processedUuids).toEqual([]);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0]).toMatchObject({ uuid: 'product-uuid-1' });
        expect(db.batch).not.toHaveBeenCalled();
    });

    it('processes valid entries even when other entries in the same batch are invalid', async () => {
        const db = fakeDb();
        const result = await pushProducts(db, [VALID_PRODUCT, { ...VALID_PRODUCT, uuid: 'bad', name: '' }]);
        expect(result.processedUuids).toEqual(['product-uuid-1']);
        expect(result.rejected).toHaveLength(1);
    });

    it('upserts on uuid, only overwriting when the incoming row is newer (last-write-wins, KTD7)', async () => {
        const preparedSql: string[] = [];
        const bind = vi.fn().mockReturnThis();
        const db = fakeDb({
            prepare: vi.fn().mockImplementation((sql: string) => {
                preparedSql.push(sql);
                return { bind, all: vi.fn(), first: vi.fn() };
            })
        });

        await pushProducts(db, [VALID_PRODUCT]);

        const sql = preparedSql[0];
        expect(sql).toContain('INSERT INTO products');
        expect(sql).toContain('ON CONFLICT(uuid) DO UPDATE');
        expect(sql).toContain('updated_at < excluded.updated_at');
        expect(bind).toHaveBeenCalledWith('product-uuid-1', 'Widget', 1000, 0, '2026-01-01T00:00:00.000Z');
    });
});

describe('pullProducts', () => {
    it('returns products updated since the given cursor plus a fresh timestamp', async () => {
        const rows = [{ uuid: 'p-1', name: 'Widget', price: 1000, archived: 0, updatedAt: '2026-02-01T00:00:00.000Z' }];
        const db = fakeDb({
            prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnThis(),
                all: vi.fn().mockResolvedValue({ results: rows }),
                first: vi.fn()
            })
        });

        const result = await pullProducts(db, '2026-01-01T00:00:00.000Z');

        expect(result.products).toEqual(rows);
        expect(result.timestamp).toEqual(expect.any(String));
    });
});
